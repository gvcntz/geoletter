import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translationSystem } from '../src/guardian.ts';

test('translation prompt: meaning over words, tenses kept, longing shown in PT/EN/ES', () => {
  const p = translationSystem('pt');
  assert.match(p, /into Brazilian Portuguese\./);
  assert.match(p, /not word by word/);
  assert.match(p, /tense/);
  assert.match(p, /"I miss your voice" = Portuguese "Sinto falta da sua voz"/);
  assert.match(p, /not "Sinto sua voz"/);
  assert.match(p, /Que saudade/);
  assert.match(p, /Echo de menos/);
  assert.match(p, /Output only the translation\.$/);
  assert.match(translationSystem('xx'), /into xx\./);
});
