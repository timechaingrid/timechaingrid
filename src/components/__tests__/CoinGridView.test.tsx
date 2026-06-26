import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CoinGridView } from '../views/CoinGridView';

// The renderer now loads the wallet table asynchronously via DuckDB-Wasm (a real
// fetch + worker), neither of which exists under jsdom. Mock the data layer so
// the test exercises the HUD chrome (the synchronous render path) without
// touching the network. An empty wallet set is enough to render the overlay.
vi.mock('@/data/walletSubstrate', () => ({
  loadWalletSubstrate: vi.fn().mockResolvedValue({ tipBlock: 0, wallets: [] }),
}));

vi.mock('pixi.js', () => {
  class StageLike {
    eventMode: string = 'none';
    hitArea: unknown = null;
    addChild = vi.fn();
    on = vi.fn().mockReturnThis();
    off = vi.fn();
  }
  class Application {
    canvas = document.createElement('canvas');
    screen = { width: 800, height: 600 };
    stage = new StageLike();
    ticker = { add: vi.fn(), remove: vi.fn() };
    init = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn();
  }
  class Container {
    position = {
      _x: 0,
      _y: 0,
      set(x: number, y: number) {
        this._x = x;
        this._y = y;
      },
    };
    scale = {
      _v: 1,
      set(v: number) {
        this._v = v;
      },
    };
    addChild = vi.fn();
  }
  class Graphics {
    eventMode: string = 'none';
    cursor: string = 'auto';
    hitArea: unknown = null;
    visible = true;
    alpha = 1;
    rect() { return this; }
    roundRect() { return this; }
    fill() { return this; }
    stroke() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    on() { return this; }
    clear() { return this; }
  }
  return { Application, Container, Graphics };
});

describe('<CoinGridView>', () => {
  it('renders a relative container div without crashing', () => {
    const { container } = render(<CoinGridView />);
    const root = container.querySelector('div');
    expect(root).toBeTruthy();
    expect(root?.className).toContain('relative');
  });

  it('shows the brand tagline in the HUD overlay', () => {
    const { container } = render(<CoinGridView />);
    expect(container.textContent).toContain('Bitcoin Visualised');
  });

  it('shows an empire counter in the HUD overlay', () => {
    const { container } = render(<CoinGridView />);
    expect(container.textContent).toContain('Empires');
  });
});
