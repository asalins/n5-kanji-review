import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AudioProvider } from '../../../src/features/audio/AudioProvider';
import { PlayAudioButton } from '../../../src/features/audio/PlayAudioButton';
import { PlaybackControls } from '../../../src/features/audio/PlaybackControls';
import { AudioUnavailableError, type AudioPlayer, type PlayRequest } from '../../../src/services/audio/audioPlayer';
import type { VoiceGender } from '../../../src/services/audio/manifest';

function fakePlayer({ genders = [] as VoiceGender[], result = Promise.resolve<'file' | 'device'>('device') } = {}) {
  const calls: PlayRequest[] = [];
  const player: AudioPlayer & { stop: ReturnType<typeof vi.fn<() => void>> } = {
    play: (request) => {
      calls.push(request);
      return result;
    },
    stop: vi.fn<() => void>(),
    gendersFor: () => genders,
  };
  return { player, calls };
}

describe('PlayAudioButton', () => {
  it('has an accessible name with what is heard and a 44 px target', () => {
    const { player } = fakePlayer();
    render(
      <AudioProvider player={player}>
        <PlayAudioButton clipId="c1" speechText="がく" label="ガク" />
      </AudioProvider>,
    );
    const button = screen.getByRole('button', { name: /ฟังเสียง ガク/ });
    expect(button.className).toMatch(/h-11 w-11/);
  });

  it('plays with the chosen speed and voice, then returns to idle (replay = press again)', async () => {
    const { player, calls } = fakePlayer({ genders: ['female', 'male'] });
    render(
      <AudioProvider player={player}>
        <PlaybackControls clipIds={['c1']} />
        <PlayAudioButton clipId="c1" speechText="がく" label="ガク" />
      </AudioProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '0.75x' }));
    fireEvent.click(screen.getByRole('button', { name: /ชาย/ }));
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-audio'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-audio'));
    });
    expect(calls).toEqual([
      { clipId: 'c1', speechText: 'がく', lang: 'ja', rate: 0.75, gender: 'male' },
      { clipId: 'c1', speechText: 'がく', lang: 'ja', rate: 0.75, gender: 'male' },
    ]);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('shows why it cannot play (no Japanese voice on the device)', async () => {
    const { player } = fakePlayer({ result: Promise.reject(new AudioUnavailableError('no-voice')) });
    render(
      <AudioProvider player={player}>
        <PlayAudioButton clipId="c1" speechText="がく" label="ガク" />
      </AudioProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-audio'));
    });
    expect(screen.getByRole('status').textContent).toMatch(/ไม่มีเสียงภาษาญี่ปุ่น/);
  });

  it('stops the sound it started when it leaves the screen', () => {
    const { player } = fakePlayer({ result: new Promise(() => {}) });
    const view = render(
      <AudioProvider player={player}>
        <PlayAudioButton clipId="c1" speechText="がく" label="ガク" />
      </AudioProvider>,
    );
    fireEvent.click(screen.getByTestId('play-audio'));
    expect(screen.getByRole('status').textContent).toMatch(/กำลังเล่น/);
    view.unmount();
    expect(player.stop).toHaveBeenCalledTimes(1);
  });

  it('does not let the click reach the element around it (a flashcard)', () => {
    const { player } = fakePlayer();
    const outer = vi.fn();
    render(
      <AudioProvider player={player}>
        <div onClick={outer}>
          <PlayAudioButton clipId="c1" speechText="がく" label="ガク" />
        </div>
      </AudioProvider>,
    );
    fireEvent.click(screen.getByTestId('play-audio'));
    expect(outer).not.toHaveBeenCalled();
  });
});

describe('PlaybackControls', () => {
  it('offers 0.75x / 1x / 1.25x with 1x selected; the voice switch is hidden without both voices', () => {
    const { player } = fakePlayer({ genders: ['female'] });
    render(
      <AudioProvider player={player}>
        <PlaybackControls clipIds={['c1']} />
      </AudioProvider>,
    );
    expect(screen.getByRole('button', { name: '1x' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '0.75x' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: '1.25x' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ชาย/ })).toBeNull();
  });
});
