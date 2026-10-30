const fs = require('fs');
const readline = require('readline');
const file = 'C:/Users/kshitijbagal/.gemini/antigravity/brain/3277c0cc-4e46-4cfa-9c9c-ef5c2bb2c6e3/.system_generated/logs/transcript_full.jsonl';
const rl = readline.createInterface({ input: fs.createReadStream(file) });
const userInputs = [];
rl.on('line', line => {
  try {
    const obj = JSON.parse(line);
    if (obj.type === 'USER_INPUT') userInputs.push(obj);
  } catch(e) {}
});
rl.on('close', () => {
  console.log('Total user inputs:', userInputs.length);
  const last2 = userInputs.slice(-2);
  last2.forEach((u, i) => {
    console.log('--- USER INPUT ' + i + ' (step ' + u.step_index + ') ---');
    console.log(u.content);
    if (u.media) console.log('Media:', JSON.stringify(u.media));
  });
});
