import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AvatarStack } from './AvatarStack';
import { PlayBrandMark, Wordmark } from './PlayBrandMark';
import { RisoBadge } from './RisoBadge';
import { RisoMiniBoardArt } from './RisoMiniBoardArt';

const seats = ['Ann Lee', 'Bo', 'Cy', 'Di', 'Ed', 'Flo'].map((name) => ({ name }));

describe('AvatarStack', () => {
  it('shows max avatars and a +N bubble', () => {
    render(<AvatarStack seats={seats} max={4} onToggle={() => {}} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.queryByText('E')).toBeNull();
    expect(screen.queryByText('F')).toBeNull();
  });
  it('has no bubble when everyone fits', () => {
    render(<AvatarStack seats={seats.slice(0, 2)} max={4} onToggle={() => {}} />);
    expect(screen.queryByText(/^\+/)).toBeNull();
  });
  it('is one labelled button calling onToggle', async () => {
    const onToggle = vi.fn();
    render(<AvatarStack seats={seats} max={4} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: '6 players' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

describe('kit smoke', () => {
  it('PlayBrandMark sizes', () => {
    const { rerender } = render(<PlayBrandMark size="header" />);
    let svg = screen.getByRole('img', { name: 'Play OYBC' });
    expect(svg).toHaveAttribute('width', '44');
    expect(svg).toHaveAttribute('height', '34');
    rerender(<PlayBrandMark size="home" />);
    svg = screen.getByRole('img', { name: 'Play OYBC' });
    expect(svg).toHaveAttribute('width', '110');
    expect(svg).toHaveAttribute('height', '85');
  });
  it('Wordmark, RisoBadge, RisoMiniBoardArt render', () => {
    const { container } = render(
      <>
        <Wordmark />
        <RisoBadge kind="expiring">Host</RisoBadge>
        <RisoMiniBoardArt />
      </>,
    );
    expect(screen.getByText('OYBC')).toBeInTheDocument();
    expect(screen.getByText('Play')).toBeInTheDocument();
    expect(screen.getByText('Host')).toBeInTheDocument();
    expect(container.querySelectorAll('i')).toHaveLength(9);
  });
});
