import Dockerode from "dockerode";

async function cmd(c: Dockerode.Container, cmd: string[]) {
	const exec = await c.exec({
		Cmd: cmd,
		AttachStdout: true,
		AttachStdin: false,
	});
	return exec.start({ hijack: false, stdin: false, Tty: true });
}

export default cmd;
