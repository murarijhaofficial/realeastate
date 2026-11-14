const fs = require('fs'), path = require('path');
const Parser = require('./qa/node_modules/php-parser');
const parser = new Parser({parser:{php7:true,suppressErrors:false}});
let count = 0;
function walk(dir) {
 for(const item of fs.readdirSync(dir,{withFileTypes:true})) {
  if(item.name === 'qa') continue;
  const file = path.join(dir,item.name);
  if(item.isDirectory()) walk(file);
  else if(file.endsWith('.php')) {parser.parseCode(fs.readFileSync(file,'utf8'),file);count++;}
 }
}
walk(__dirname);
console.log(`PHP syntax valid: ${count} files`);
