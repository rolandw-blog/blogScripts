import Docker from "dockerode";
import cmd from "./cmd.js";
// import yargs from "yargs";
// import * as yargs from "yargs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
const parser = yargs(hideBin(process.argv)).options({
    source: { type: "string", demandOption: true, alias: "s" },
    destination: { type: "string", demandOption: true, alias: "d" },
});
const argv = await parser.argv;
const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const vol1 = docker.getVolume(argv.source);
const vol2 = docker.getVolume(argv.destination);
console.log(`volume 1:\t\t${vol1.name}`);
console.log(`volume 2:\t\t${vol2.name}`);
// check that source exists
try {
    const i = await vol1.inspect();
    console.log(`${i.Name} exists`);
}
catch (e) {
    console.log(`${argv.source} does not exist`);
    process.exit(1);
}
// check that destination exists
try {
    const i = await vol2.inspect();
    console.log(`${i.Name} exists`);
}
catch (e) {
    console.log(`${argv.destination} does not exist`);
    process.exit(1);
}
// create container options
const options = {
    name: "temp",
    Image: "busybox",
    WorkingDir: "/source",
    Env: ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
    AttachStderr: true,
    AttachStdin: false,
    AttachStdout: true,
    Tty: true,
    OpenStdin: true,
    StdinOnce: false,
    Cmd: ["/bin/sh"],
    HostConfig: {
        Binds: [`${vol1.name}:/source`, `${vol2.name}:/destination`],
    },
};
// create a container
const c = await docker.createContainer(options);
console.log(`Created container ${c.id}`);
// start the container
await c.start();
console.log(`Started container ${c.id}`);
// =================================================================================================
const cmdCopy = await cmd(c, ["cp", "-r", "/source", "/destination"]);
// wait for data then print it
cmdCopy.on("data", (data) => {
    console.log(data.toString());
});
const cmdCopyPromise = new Promise(async (resolve, reject) => {
    const cmdCopy = await cmd(c, ["cp", "-r", "/source", "/destination"]);
    cmdCopy.on("data", (data) => {
        console.log(data.toString());
    });
    cmdCopy.on("end", () => {
        resolve();
    });
});
const cmdPrintPromise = new Promise(async (resolve, reject) => {
    const cmdPrint = await cmd(c, ["ls", "-al", "/destination"]);
    cmdPrint.on("data", (data) => {
        console.log(data.toString());
    });
    cmdPrint.on("end", () => {
        resolve();
    });
});
// wait for commands to finish
await Promise.all([cmdCopyPromise, cmdPrintPromise]);
// stop the container
console.log("stopping container");
await c.stop();
await c.remove({ force: false });
console.log(`removed container ${c.id}`);
