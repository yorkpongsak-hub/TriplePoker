// Render the real CountryBadge component with clearly labeled sample ranking data.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require('typescript'),React=require('react'),ReactDOM=require('react-dom/server'),RN=require('react-native-web');
const original=Module._load;
Module._load=function(id,...args){return id==='react-native'?RN:original.call(this,id,...args);};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
require.extensions['.png']=(m,file)=>{m.exports={uri:'data:image/png;base64,'+fs.readFileSync(file).toString('base64'),width:64,height:48};};
const {CountryBadge}=require('../src/country/CountryBadge.tsx');
const rows=[['TH','Siam Strategist'],['JP','Sakura'],['BR','Rio Player'],['US','River Ace'],['FR','Camille'],['VN','Minh'],[null,'New Player']];
const content=ReactDOM.renderToStaticMarkup(React.createElement(RN.View,{style:{width:350,maxWidth:'100%',alignSelf:'center',padding:16,backgroundColor:'#163A25',borderRadius:16}},
  React.createElement(RN.Text,{style:{fontSize:22,color:'#FFD76A',fontWeight:'bold'}},'RANKING'),
  React.createElement(RN.Text,{style:{color:'#C8C4B0',marginVertical:12}},'Preview · Sample players, not live rankings'),
  ...rows.map(([code,name],i)=>React.createElement(RN.View,{key:name,style:{flexDirection:'row',paddingVertical:12,borderBottomWidth:1,borderColor:'#3A5A44',alignItems:'center',gap:12}},
    React.createElement(RN.Text,{style:{color:'#FFD76A',width:24}},String(i+1)),
    React.createElement(RN.View,{style:{flex:1}},React.createElement(RN.Text,{style:{color:'white',fontWeight:'bold'}},name),React.createElement(CountryBadge,{code})),
    React.createElement(RN.Text,{style:{color:'#FFD76A'}},String(1200-i*75))))));
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Country flag preview — sample data</title><style>body{margin:0;padding:24px 12px;background:#091D19;font-family:Arial}'+RN.StyleSheet.getSheet().textContent+'</style></head><body>'+content+'</body></html>';
fs.writeFileSync(path.resolve(__dirname,'../launch-preview/country-preview.html'),html);
console.log('Country badge preview ready');
