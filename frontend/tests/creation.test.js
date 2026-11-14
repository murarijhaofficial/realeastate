import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('create buttons do not pass browser events as records to edit', async () => {
  const source = await fs.readFile('src/main.tsx', 'utf8');
  for (const [id, handler] of [['new-project', 'showProjectForm'], ['new-plot', 'showPlotForm']]) {
    const line = source.split('\n').find((line) => line.includes(`querySelector('#${id}')`));
    assert.ok(line);
    const button = new EventTarget();
    let received;
    new Function('document', handler, line)(
      { querySelector: () => button },
      (...args) => { received = args; },
    );
    button.dispatchEvent(new Event('click'));
    assert.deepEqual(received, [], `${id} should open a blank creation form`);
  }
});
