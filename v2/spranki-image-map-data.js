(function(){
  'use strict';
  async function load(){
    const encoded=(window.UKMLA_SPRANKI_MAP_CHUNKS||[]).join('');
    if(!encoded)throw new Error('Spranki image-map chunks are missing.');
    if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot decompress the local image map.');
    const bytes=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }
  window.UKMLA_SPRANKI_MAP_DATA={load,compressedBytes:42196,imageCount:953,chunkCount:9};
})();
