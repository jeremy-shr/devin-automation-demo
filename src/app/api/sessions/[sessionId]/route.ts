import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/devin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }
    
    // Fetch session details from Devin
    const session = await getSession(sessionId);
    
    // Return sanitized session info for frontend
    return NextResponse.json({
      session_id: session.session_id,
      url: session.url,
      status_enum: session.status_enum,
      structured_output: session.structured_output,
      pull_request_url: session.pull_request?.url || null,
      updated_at: session.updated_at,
      messages_count: session.messages_count,
      title: session.title,
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('environment variable')) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }
      
      if (error.message.includes('Devin API error (404)')) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        );
      }
      
      if (error.message.includes('Devin API')) {
        return NextResponse.json(
          { error: error.message },
          { status: 502 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch session details' },
      { status: 500 }
    );
  }
}
