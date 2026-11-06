import { readFile, writeFile } from 'node:fs/promises';
import { Engine } from './dist/core.js';
import {packProject,unpackProject} from './dist/project-codec.js';
import {loadFaceModel} from './dist/auto-focus.js';
import {prepareCommands} from './dist/subject-model.js';
loadFaceModel(await readFile(new URL('./dist/vendor/facefinder',import.meta.url)));
const [input, commands, output] = process.argv.slice(2);
if (!input || !commands || !output) {
  console.log('Usage: node cli.mjs input.bitdraw.json commands.json output.bitdraw.json');
  process.exitCode = 1;
} else {
  try {
    const engine = new Engine(await unpackProject(JSON.parse(await readFile(input, 'utf8'))));
    const batch = JSON.parse(await readFile(commands, 'utf8'));
    if (!Array.isArray(batch) || batch.length > 1000) throw Error('指令檔需為最多 1000 筆的 JSON 陣列');
    await prepareCommands(engine.project.source,batch);
    for (const command of batch) engine.dispatch(command);
    await writeFile(output, JSON.stringify(await packProject(engine.project)));
    console.log(JSON.stringify({ ok: true, width: engine.project.width, height: engine.project.height, colors: engine.project.palette.length, output }));
  } catch (error) { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; }
}
