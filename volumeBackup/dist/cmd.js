async function cmd(c, cmd) {
    const exec = await c.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStdin: false,
    });
    return exec.start({ hijack: false, stdin: false, Tty: true });
}
export default cmd;
