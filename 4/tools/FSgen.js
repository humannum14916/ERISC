const compiler = require("./ERISCassembler.js");
const ascii = require("./ASCIIconvert.js");
const {decHex,hexDec} = compiler;
const fs = require("fs");
const read = fs.readFileSync;
const write = fs.writeFileSync;
const path = require("path");

module.exports = function(inputf,outputf){

function error(e){
  console.log("FS build error:");
  console.log(e);
  process.exit(1);
}

function formatCode(bin){
  let filled = {};
  let max = 0;
  for(let a of bin){
    filled[a[0]] = a[1];
    if(hexDec(a[0]) > max) max = hexDec(a[0]);
  }
  let out = [];
  while(out.length <= max){
    if(filled[decHex(out.length)]){
      out.push(filled[decHex(out.length)]);
    } else {
      out.push(0);
    }
  }
  return out;
}

function formatText(file){
  return ascii(file).map(decHex);
}

function format(file){
  let out = "";
  let adr = 0;
  let addLine = 0;
  for(let w of file){
    if(addLine == 8){
      addLine = 0;
      out += "\n";
    }
    out += (out[out.length-1]=="\n")?"":" ";
    out += w;
    adr++
    addLine++
  }
  while(adr%256 != 0){
    if(addLine == 8){
      addLine = 0;
      out += "\n";
    }
    out += (out[out.length-1]=="\n")?"":" ";
    out += 0;
    adr++
    addLine++
  }
  out = out.slice(1);
  out += "\n";
  return {out,blocks:adr/256};
}

function buildHeader(file){
  //build header
  let header = [];
  header.push({
    directory:0,
    executable:1,
    text:2
  }[file.type]);//type code
  let numBlocks = Math.ceil(file.contents.length/256);
  for(let i=0;i<numBlocks;i++){
    header.push(decHex((nextBlock+1+i)*256));
  }//data block list
  header.push(0);//data blocks list termination
  header = header.concat(ascii(file.name).map(decHex));//name
  header.push(0);//name termination
  if(header.length > 256) {
    error("Header for file "+file.name+" too big");
  }
  return header;
}

function buildFile(file){
  if(file.source){
    let source = read(file.source,"utf-8");
    if(file.type == "executable"){
      file.contents = formatCode(
        compiler.compile(source)
      );
      console.log(file.name+": "+
        Math.ceil(file.contents.length/256)*256
        +" words");
    } else if(file.type == "text"){
      file.contents = formatText(source);
    }
  }
  let header = format(buildHeader(file));
  let headerPos = decHex(nextBlock*256);
  disk += header.out;
  nextBlock += header.blocks;
  if(file.type == "directory"){
    nextBlock += Math.ceil(file.contents.length/256);
    let insert = disk.length;
    let data = [];
    for(let f of file.contents){
      data.push(buildFile(f));
    }
    disk = disk.slice(0,insert)
      +format(data).out
      +disk.slice(insert);
  } else {
    let data = format(file.contents);
    disk += data.out;
    nextBlock += data.blocks;
  }
  return headerPos;
}

let files = JSON.parse(read(inputf,"utf8"));
let dest = outputf;

let disk = "v2.0 raw\n";
let nextBlock = 0;

//compile the kernel
if(!files.kernel) error("No kernel file");
let kernel = format(formatCode(
  compiler.compile(read(files.kernel,"UTF-8"))
));
disk += kernel.out;
let kSizeOld = JSON.parse(read("images/oldKernelLen.json"));
let kernelSize = kernel.blocks*256;
if(kernelSize!=kSizeOld) error("Warning: Kernel size changed from "+kSizeOld+" to "+kernelSize);
console.log("Kernel size: "+kernelSize+" words")
nextBlock += kernel.blocks;

//build the file system
buildFile(files,true);

//write to destination
write(dest,disk);

}
