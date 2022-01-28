
const fs = require("fs");
const read = fs.readFileSync;
const write = fs.writeFileSync;
const {serve,call} = require("../../utils/ioWrap.js");
const {toASCII} = require("../../utils/convert.js");

console.errorO = console.error;
console.error = m=>{console.errorO("[FSgen] "+m)};

function error(e){
  console.error("FS build error:");
  console.error(e);
  process.exit(1);
}


function blockPad(arr){
  while(arr.length % 256 != 0) arr.push(0);
  return arr;
}

function buildContents(file,root){
  if(file.type == "asm"){
    console.error(`Assembling ${file.source}...`);
    let r = blockPad(
      JSON.parse(call(
        "codeGen/v3/assembler.js",
        read(root+file.source),[root,"true"])
      ).map(e=>{return e[1]})
    );
    console.error(`Assembled ${file.source}, ${r.length / 256} blocks`);
    return r;
  } else if(file.type == "cl"){
    console.error(`Compiling ${file.source}...`);
    let compiled = call(
      "codeGen/v2/compiler.js",
      read(root+file.source),[root,file.source]
    );
    console.error(`Assembling ${file.source}...`);
    let r = blockPad(
      JSON.parse(call(
        "codeGen/v3/assembler.js",
        compiled,[root,"true"])
      ).map(e=>{return e[1]})
    );
    console.error(`Assembled ${file.source}, ${r.length / 256} blocks`);
    return r;
  } else if(file.type == "compound"){
    console.error(`Building compound file ${file.source || ""}...`);
    let cs = file.contents.map(f=>{return buildContents(f,root)}).flat();
    console.error(`Compound file ${file.source || ""} built, length ${cs.length / 256} blocks`);
    return cs;
  } else error("Unknown file type \""+file.type+"\"");
}


serve((_,params)=>{

let root = params[0];
let dest = params[1];

if(!root) error("No source root set!");
if(!dest) error("No destination set!");

let files = JSON.parse(read(root+"fsLayout.json","utf8"));

//build the reserved area
let reservedArea = buildContents(files.reserved,root);

//create the disk info block
let disk =
  //root directory index
  [(reservedArea.length / 256) + 1]
.concat(
  [0] //gap list head
).concat(
  //reserved area length
  [reservedArea.length / 256]
).concat(
  //disk name
  toASCII(files.diskName)
).concat(0); //terminating null
//length check
if(disk.length > 256)
  error(`Disk name is ${disk.length - 256} words too long`);
//pad
blockPad(disk);

//add the reserved area
disk = disk.concat(reservedArea);

//create the actual file tree

//get the disk length
let diskLen = disk.length / 256;

//fill in the gap list head
disk[1] = diskLen;

//stringify the disk
disk = disk.reduce((a,w,i)=>{
  return a + w + ((i % 8 == 7)?"\n":" ");
},"v2.0 raw\n");

console.error(`Disk "${files.diskName}" built, ${diskLen} blocks`);

//return
return disk;

});
