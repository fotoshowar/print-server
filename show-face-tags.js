const data = require('./face-detection-found.json');

const faceTags = Object.entries(data.allTags).filter(([k]) =>
  k.toLowerCase().includes('face')
);

console.log('Tags de Face encontrados:\n');

faceTags.forEach(([k, v]) => {
  console.log(`\n${k}:`);
  console.log(JSON.stringify(v, null, 2));
});
