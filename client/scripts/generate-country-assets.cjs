// Usage: node scripts/generate-country-assets.cjs <unpacked flag-icons package> <sharp module>
const fs=require('node:fs'),path=require('node:path');
const source=path.resolve(process.argv[2]);
const sharp=require(process.argv[3]);
const output=path.resolve(__dirname,'../assets/countries');
const data=JSON.parse(fs.readFileSync(path.join(source,'country.json'),'utf8')).filter(c=>c.iso).sort((a,b)=>a.name.localeCompare(b.name));
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  for(const c of data)await sharp(path.join(source,c.flag_4x3)).resize(64,48).png().toFile(path.join(output,c.code+'.png'));
  fs.copyFileSync(path.join(source,'LICENSE'),path.join(output,'LICENSE'));
  fs.writeFileSync(path.join(output,'README.md'),'Flags: flag-icons 7.5.0 (MIT), https://github.com/lipis/flag-icons. Rasterized to 64×48 for consistent offline web/Android rendering.\n');
  fs.mkdirSync(path.resolve(__dirname,'../src/country'),{recursive:true});
  fs.writeFileSync(path.resolve(__dirname,'../src/country/countries.ts'),'// Generated from flag-icons 7.5.0 ISO country/territory metadata.\nexport const COUNTRIES = [\n'+data.map(c=>`  {code:${JSON.stringify(c.code.toUpperCase())},name:${JSON.stringify(c.name)},image:require('../../assets/countries/${c.code}.png')},`).join('\n')+'\n];\n');
  console.log('Generated '+data.length+' bundled country flags');
})();
