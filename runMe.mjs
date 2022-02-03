#!/usr/bin/env zx

const path = require("path");
const fs = require("fs");

const q = $.quote;

$.verbose = false;
const blogEnv = (await $`echo $BLOG_ENV`).stdout.trim();
const blogCertDir = (await $`echo $BLOG_CERT_DIR`).stdout.trim();
let blogCertDirParsed = undefined;

async function createTempContainer(name = "temp_container", volumes = [], image = "alpine:latest") {
  let volumeString = "";
  let dockerPath = undefined;
  dockerPath = await $`which docker`;
  if (dockerPath.exitCode !== 0) {
    throw new Error("docker not found");
  }

  for (const v of volumes) {
    volumeString += `-v ${v}`;
  }

  try {
    console.log(`Creating temp container ${name}`);
    $.quote = (v) => v;
    await $`docker create --name ${name} ${volumeString} ${image}`;
    $.quote = q;
  } catch (err) {
    console.log(chalk.bgRed(err));
  }
}

async function deleteTempContainer(name) {
  console.log("Tearing down temp container");
  $.quote = (v) => v;
  await nothrow($`docker stop ${name}`);
  await nothrow($`docker rm ${name}`);
  $.quote = q;
}

// get the blog env
if (blogEnv !== "production" && blogEnv !== "development") {
  console.log('BLOG_ENV must be "production" or "development"');
  console.log(`The blog environment is set to "${blogEnv}"`);
  process.exit(1);
}

// get the cert dir as a parsed path
try {
  blogCertDirParsed = path.parse(path.resolve(blogCertDir));
  if (fs.existsSync(blogCertDirParsed.dir) === false) {
    throw new Error(`The blog cert directory "${blogCertDirParsed.dir}" does not exist`);
  }
} catch (err) {
  console.log(chalk.bgRed(err));
  process.exit(1);
}

// Symlink compose scripts
console.log(chalk.bgCyan("[STEP]\t Linking docker compose scripts to root of blog..."));
// root is where blogscripts is run from
const root = (await $`pwd -P`).stdout.trim();
await nothrow($`rm ../docker-compose.yaml`);
await nothrow($`ln -s ${root}/docker/docker-compose.yaml ../docker-compose.yaml`);
console.log("linking development.yaml");
await nothrow($`rm ../development.yaml`);
await nothrow($`ln -s ${root}/docker/development.yaml ../development.yaml`);
console.log("linking production.yaml");
await nothrow($`../production.yaml`);
await nothrow($`ln -s ${root}/docker/production.yaml ../production.yaml`);
console.log("linking .dockerignore");
await nothrow($`../.dockerignore`);
await nothrow($`ln -s ${root}/docker/.dockerignore ../.dockerignore`);
console.log(chalk.bgCyan("[COMPLETE]\n"));

// Make the various directories
console.log(chalk.bgCyan("[STEP]\t Creating content directories"));
$.verbose = true;
await $`docker run --rm --name temp_container -v blog_content:/html alpine mkdir -p /html/static`;
await $`docker run --rm --name temp_container -v blog_content:/html alpine mkdir -p /html/static/css`;
await $`docker run --rm --name temp_container -v blog_content:/html alpine mkdir -p /html/static/scripts`;
await $`docker run --rm --name temp_container -v blog_content:/html alpine mkdir -p /html/static/media`;
$.verbose = false;
console.log(chalk.bgCyan("[COMPLETE]\n"));

// create env file
console.log(chalk.bgCyan("[STEP]\t Creating env file for compose"));
await $`rm ../.env`;
await nothrow($`ln -s ${root}/docker/.env ../.env`);
console.log(chalk.bgCyan("[COMPLETE]\n"));

// Create data containers
console.log(chalk.bgCyan("[STEP]\t Creating blog containers"));
$.verbose = true;
await $`docker volume create --name=blog_content`;
await $`docker volume create --name=blogwatcher_database`;
await $`docker volume create --name=blog_nginx_proxy_certs`;
$.verbose = false;
console.log(chalk.bgCyan(chalk.bgCyan("[COMPLETE]\n")));

// Compile css
console.log(chalk.bgCyan("[STEP]\t Compiling SCSS to CSS"));

// Check node sass is installed
const nodeSassPath = await nothrow($`command -v node-sass`);
if (nodeSassPath.exitCode !== 0) {
  console.log(chalk.bgRed("node-sass not found. Please install node-sass"));
  process.exit(1);
}

$.verbose = true;
await $`node-sass -r -o ./public/css ./public`;
$.verbose = false;

const cssPath = path.resolve(root, "public/css");
const mediaPath = path.resolve(root, "public/media");
const scriptsPath = path.resolve(root, "public/js");

// copy public stuff over
await $`docker run --rm --name temp_container -v "blog_content:/html" -v "${cssPath}:/css" alpine cp -r /css /html/static`;
await $`docker run --rm --name temp_container -v "blog_content:/html" -v "${mediaPath}:/media" alpine cp -r /media /html/static`;
await $`docker run --rm --name temp_container -v "blog_content:/html" -v "${scriptsPath}:/scripts" alpine cp -r /scripts /html/static`;

console.log(chalk.bgGray("CSS"));
const cssFiles = (
  await $`docker run --rm --name temp_container -v "blog_content:/html" -v "${cssPath}:/css" alpine ls -l /html/static/css`
).stdout.trim();
console.log(cssFiles);

console.log(chalk.bgGray("MEDIA"));
const mediaFiles = (
  await $`docker run --rm --name temp_container -v "blog_content:/html" -v "${mediaPath}:/media" alpine ls -l /html/static/media`
).stdout.trim();
console.log(mediaFiles);

console.log(chalk.bgGray("SCRIPTS"));
const scriptFiles = (
  await $`docker run --rm --name temp_container -v "blog_content:/html" -v "${scriptsPath}:/scripts" alpine ls -l /html/static/scripts`
).stdout.trim();
console.log(scriptFiles);
console.log(chalk.bgCyan("[COMPLETE]\n"));

console.log(chalk.bgCyan("[STEP]\t Moving certificates to blog_nginx_proxy_certs volume"));
// certs expects symlinks to the actual certs
const certs = (
  await $`sudo find ${path.resolve(blogCertDirParsed.dir, blogCertDirParsed.base)} -type l`
).stdout
  .trim()
  .split("\n")
  .filter((s) => /.*\.pem/.test(s));

// clean up old certs
console.log("Cleaning up old certs");
await deleteTempContainer("temp_container");
await $`sudo docker run --rm --name temp_container -v blog_nginx_proxy_certs:/keys alpine find /keys -type f -delete`;
await $`sudo docker run --rm --name temp_container -v blog_nginx_proxy_certs:/keys alpine find /keys -type l -delete`;

// copy new certs into volume
console.log("Copying new certs");
for (const f of certs) {
  await createTempContainer("temp_container", ["blog_nginx_proxy_certs:/keys"], "alpine");
  const certPath = path.resolve(f);
  const resolvedSymlink = (await $`sudo realpath ${certPath}`).stdout.trim();
  $.verbose = true;
  await $`sudo docker cp -L ${resolvedSymlink} temp_container:/keys/${path.parse(f).base}`;
  $.verbose = false;
  await deleteTempContainer("temp_container");

  // symlink new certs to standard names
  $.quote = (v) => v;
  if (/^cert\d+/.test(f)) {
    await $`docker run --name "temp_container" --rm -v "blog_nginx_proxy_certs:/keys" busybox chmod root:root "/keys/${f}"`;
    await $`docker run --name "temp_container" --rm -v "blog_nginx_proxy_certs:/keys" busybox ln -s -f "/keys/${f}" "/keys/cert.pem"`;
    continue;
  }
  if (/^chain\d+/.test(f)) {
    await $`docker run --name "temp_container" --rm -v "blog_nginx_proxy_certs:/keys" busybox chmod root:root "/keys/${f}"`;
    await $`docker run --name "temp_container" --rm -v "blog_nginx_proxy_certs:/keys" busybox ln -s -f "/keys/${f}" "/keys/chain.pem"`;
    continue;
  }
  if (/^fullchain\d+/.test(f)) {
    await $`docker run --name "temp_container" --rm -v "blog_nginx_proxy_certs:/keys" busybox chmod 644 "/keys/${f}"`;
    await $`docker run --name "temp_container" --rm -v "blog_nginx_proxy_certs:/keys" busybox chmod root:root "/keys/${f}"`;
    await $`docker run --name "temp_container" --rm -v "blog_nginx_proxy_certs:/keys" busybox ln -s -f "/keys/${f}" "/keys/fullchain.pem"`;
    continue;
  }
  if (/^privkey\d+/.test(f)) {
    await $`docker run --name "temp_container" --rm -v "blog_nginx_proxy_certs:/keys" busybox chmod 600 "/keys/${f}"`;
    await $`docker run --name "temp_container" --rm -v "blog_nginx_proxy_certs:/keys" busybox chmod root:root "/keys/${f}"`;
    await $`docker run --name "temp_container" --rm -v "blog_nginx_proxy_certs:/keys" busybox ln -s -f "/keys/${f}" "/keys/privkey.pem"`;
    continue;
  }
  $.quote = q;
}

// print out the certs
$.quote = (v) => v;
const keysInContainer = (
  await $`sudo docker run --rm --name temp_container -v blog_nginx_proxy_certs:/keys alpine ls -l /keys`
).stdout.trim();
console.log(keysInContainer);
$.quote = q;

console.log(chalk.bgCyan("[COMPLETE]\n"));

// if the gateway_network does not exist then create it
console.log(chalk.bgCyan("[STEP]\t Creating gateway_network"));
if ((await $`docker network inspect gateway_network`).exitCode !== 0) {
  await $`docker network create --driver bridge --subnet`;
  console.log("Created gateway_network");
} else {
  console.log("gateway_network already exists");
}
console.log(chalk.bgCyan("[COMPLETE]\n"));
