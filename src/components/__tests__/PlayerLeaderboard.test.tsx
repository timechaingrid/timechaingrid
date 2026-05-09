import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PlayerLeaderboard } from '../PlayerLeaderboard';
import { useTimegridStore } from '@/store/timegridStore';

beforeEach(() => {
  useTimegridStore.setState({
    currentBlock: 0,
    latestBlock: 0,
    selectedWallet: null,
    activeDockPanel: null,
    camera: { position: { x: 0, y: 0 }, zoom: 1 },
  });
});

describe('<PlayerLeaderboard>', () => {
  it('renders the panel header', () => {
    const { getByText } = render(<PlayerLeaderboard />);
    expect(getByText(/^Top players$/i)).toBeTruthy();
  });

  it('lists ranked rows for wallets that own coins', () => {
    const { container } = render(<PlayerLeaderboard />);
    const buttons = container.querySelectorAll('button');
    // Fixture has 6 minters (Satoshi + 5 mock miners), all of whom
    // own coins under the v0 owner=minter invariant. We show up to 8.
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.length).toBeLessThanOrEqual(8);
  });

  it('clicking a row pins that wallet and opens the inspector', () => {
    const { container } = render(<PlayerLeaderboard />);
    const firstButton = container.querySelector('button');
    expect(firstButton).toBeTruthy();
    fireEvent.click(firstButton!);
    const state = useTimegridStore.getState();
    expect(state.selectedWallet).toBeTruthy();
    expect(state.activeDockPanel).toBe('wallet-inspector');
  });

  it('marks a row as pressed when its wallet is selected', () => {
    const { container, rerender } = render(<PlayerLeaderboard />);
    const firstButton = container.querySelector('button')!;
    expect(firstButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(firstButton);
    rerender(<PlayerLeaderboard />);
    // The clicked row should now be aria-pressed="true"; others stay false.
    const pressed = container.querySelectorAll('button[aria-pressed="true"]');
    expect(pressed.length).toBe(1);
  });

  it('shows the "click to highlight" hint copy', () => {
    const { getByText } = render(<PlayerLeaderboard />);
    expect(getByText(/click a row/i)).toBeTruthy();
  });
});
