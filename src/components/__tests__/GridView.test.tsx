import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GridView } from '../views/GridView';

// Mock pixi.js — jsdom has no canvas/WebGL, and PixiJS reaches for both.
// Use class syntax so `new Application()` works as a constructor (Vitest 4
// rejects plain arrow-function implementations for `new`-able mocks).
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
    circle() { return this; }
    fill() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    stroke() { return this; }
    on() { return this; }
  }
  return { Application, Container, Graphics };
});

describe('<GridView>', () => {
  it('renders a container div without crashing', () => {
    const { container } = render(<GridView />);
    expect(container.querySelector('div')).toBeTruthy();
  });
});
