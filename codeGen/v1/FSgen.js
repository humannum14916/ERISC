const compiler = require("./assemblerBase.js");
const fs = require("fs");
const read = fs.readFileSync;
const write = fs.writeFileSync;
const path = require("path");

module.exports = function(root,outputf){

function format(bin){
  let filled = {};
  for(let a of bin){
    filled[a[0]] = a[1];
  }
  let read = 0;
  let out = "";
  let adr = 0;
  let addLine = 0;
  let first = true;
  while(adr < 256){
    if(addLine == 8){
      addLine = 0;
      out += "\n";
    }
    let pre = (out[out.length-1]=="\n")?"":" ";
    if(first){
      first = false;
      pre = "";
    }
    let hex = compiler.decHex(adr);
    if(filled[hex]){
      out += pre+filled[hex];
      read++
    } else {
      out += pre+"0"
    }
    adr++
    addLine++
  }
  out += "\n";
  return out;
}

const ascii = [
  " ","!","\"","#","$","%","&","'","(",")","*","+","","-",".","/",
  "0","1","2","3","4","5","6","7","8","9",":",";","<","=",">","?",
  "@","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O",
  "P","Q","R","S","T","U","V","W","X","Y","Z","[","\\","]","^","_",
  "`","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o",
  "p","q","r","s","t","u","v","w","x","y","z","{","|","}","~"
];

function genDiskTable(files){
  let o = "";
  let filled = 0;
  let addLine = 0;
  let toAdd = [];
  for(let f of files){
    let chars = f.split("").map(c=>{return compiler.decHex(ascii.indexOf(c)+32);});
    toAdd = toAdd.concat(chars).concat("0");
  }
  while(filled < 256){
    if(addLine == 8){
      addLine = 0;
      o += "\n";
    } else if(addLine != 0){
      o += " ";
    }
    o += toAdd[filled] || "0";
    filled++
    addLine++
  }
  return o;
}

let files = JSON.parse(read(root+"fsLayout.json","utf8"));
let dest = outputf;

let compiled = files.map(f=>{
  return compiler.compile(read(root+f,"utf8"),root);
});

let out = "v2.0 raw\n"+genDiskTable(files.map(f=>{
  return path.parse(f).name;
}))+"\n"+compiled.map(format).join("");

write(dest,out);

}
