'use client';

interface ConfidenceBadgeProps {
  score: number;
  showLabel?: boolean;
  size?: 'small' | 'medium';
}

export function ConfidenceBadge({ score, showLabel = false, size = 'medium' }: ConfidenceBadgeProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'confidence-high';
    if (score >= 50) return 'confidence-medium';
    return 'confidence-low';
  };

  const sizeClass = size === 'small' ? 'confidence-badge-small' : '';

  return (
    <span className={`confidence-badge ${getScoreColor(score)} ${sizeClass}`}>
      {showLabel && <span className="confidence-label">Confidence:</span>}
      <span className="confidence-score">{score}</span>
    </span>
  );
}
