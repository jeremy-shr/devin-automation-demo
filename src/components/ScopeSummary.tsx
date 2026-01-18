'use client';

import { ConfidenceBadge } from './ConfidenceBadge';
import { RawJsonPanel } from './RawJsonPanel';
import { ScopeOutputSchema, type ScopeOutput } from '@/lib/schemas';

interface ScopeSummaryProps {
  data: Record<string, unknown>;
}

function parseStructuredOutput(data: Record<string, unknown>): ScopeOutput | null {
  try {
    const result = ScopeOutputSchema.safeParse(data);
    if (result.success) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

interface ListSectionProps {
  title: string;
  items: string[];
}

function ListSection({ title, items }: ListSectionProps) {
  return (
    <div className="scope-section">
      <h5 className="scope-section-title">{title}</h5>
      {items.length > 0 ? (
        <ul className="scope-list">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="scope-empty">None</p>
      )}
    </div>
  );
}

export function ScopeSummary({ data }: ScopeSummaryProps) {
  const parsed = parseStructuredOutput(data);

  if (!parsed) {
    return <RawJsonPanel data={data} title="Raw Output (parsing failed)" />;
  }

  return (
    <div className="scope-summary">
      <div className="scope-confidence-section">
        <div className="scope-confidence-header">
          <ConfidenceBadge score={parsed.confidence_score} showLabel />
        </div>
        <p className="scope-confidence-rationale">{parsed.confidence_rationale}</p>
      </div>

      <div className="scope-ready-status">
        <span className={`ready-indicator ${parsed.ready_to_execute ? 'ready' : 'not-ready'}`}>
          {parsed.ready_to_execute ? 'Ready to Execute' : 'Not Ready'}
        </span>
      </div>

      <div className="scope-section">
        <h5 className="scope-section-title">Action Plan</h5>
        <ol className="scope-action-plan">
          {parsed.action_plan.map((step) => (
            <li key={step.step} className="action-step">
              <span className="action-step-title">{step.title}</span>
              <span className="action-step-details">{step.details}</span>
            </li>
          ))}
        </ol>
      </div>

      <ListSection title="Assumptions" items={parsed.assumptions} />
      
      <div className={`scope-section ${!parsed.ready_to_execute ? 'highlighted' : ''}`}>
        <h5 className="scope-section-title">Unknowns</h5>
        {parsed.unknowns.length > 0 ? (
          <ul className="scope-list">
            {parsed.unknowns.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="scope-empty">None</p>
        )}
      </div>

      <ListSection title="Risks" items={parsed.risks} />
    </div>
  );
}
