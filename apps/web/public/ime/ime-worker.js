importScripts('/ime/naive_pinyin.js');

let modulePromise;
let context = 0;

async function engine() {
  if (context) return;
  const [wasm, dictionary] = await Promise.all([
    self.createNaivePinyin({ locateFile: path => `/ime/${path}` }),
    fetch('/ime/naive_pinyin.dict.txt').then(response => response.arrayBuffer())
  ]);
  context = wasm.ccall('np_create', 'number', ['string'], [JSON.stringify({ max_candidates: 9 })]);
  if (!context) throw new Error('Could not create the pinyin engine.');
  const bytes = new Uint8Array(dictionary); const pointer = wasm._malloc(bytes.length);
  wasm.HEAPU8.set(bytes, pointer);
  const loaded = wasm.ccall('np_load_dict', 'number', ['number', 'number', 'number'], [context, pointer, bytes.length]);
  wasm._free(pointer);
  if (loaded !== 1) throw new Error('Could not load the pinyin dictionary.');
  modulePromise = wasm;
}

self.onmessage = async event => {
  try {
    await engine();
    const wasm = modulePromise;
    const { id, input, commit } = event.data;
    if (commit) wasm.ccall('np_commit', null, ['number', 'string'], [context, JSON.stringify(commit)]);
    const result = input ? JSON.parse(wasm.ccall('np_query', 'string', ['number', 'string'], [context, input])) : { input: '', candidates: [] };
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id: event.data?.id, ok: false, error: error instanceof Error ? error.message : 'Pinyin engine failed.' });
  }
};
