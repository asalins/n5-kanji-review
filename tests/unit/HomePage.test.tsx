import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../../src/app/App';

describe('App', () => {
  it('starts and renders the home page', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'N5 Kanji Review' })).toBeTruthy();
  });
});
