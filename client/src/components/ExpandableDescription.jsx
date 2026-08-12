
export default function ExpandableDescription({ text, style, isDetailView = false }) {
  if (!text) return null;
  
  const isLong = text.length > 30;
  
  return (
    <p style={{ 
      fontSize: '0.875rem', 
      color: 'var(--color-text-secondary)', 
      margin: 'var(--space-sm) 0 0 0', 
      lineHeight: '1.6',
      wordBreak: 'break-word',
      overflowWrap: 'break-word',
      ...style 
    }}>
      {isDetailView || !isLong ? text : text.substring(0, 30) + '...'}
      {!isDetailView && isLong && (
        <span 
          style={{ 
            color: 'var(--color-accent)', 
            padding: '0 0 0 4px', 
            fontSize: '0.875rem', 
            fontWeight: 600,
          }}
        >
          Read More
        </span>
      )}
    </p>
  );
}
