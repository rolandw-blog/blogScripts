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
    console.log(err);
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
  console.log(err);
  process.exit(1);
}

// Symlink compose scripts
console.log(chalk.bgCyan("[STEP]\t Linking docker compose scripts to root of blog..."));
// root is where blogscripts is run from
const root = (await $`pwd -P`).stdout.trim();
await $`ln -s ${root}/docker/docker-compose.yaml ../docker-compose.yaml`.catch(() => {});
console.log("linking development.yaml");
await $`ln -s ${root}/docker/development.yaml ../development.yaml`.catch(() => {});
console.log("linking production.yaml");
await $`ln -s ${root}/docker/production.yaml ../production.yaml`.catch(() => {});
console.log("linking .dockerignore");
await $`ln -s ${root}/docker/.dockerignore ../.dockerignore`.catch(() => {});
console.log(chalk.bgCyan("[COMPLETE]\n"));

// create env file
console.log(chalk.bgCyan("[STEP]\t Creating env file for compose"));
$`ln -s ${root}/docker/.env ../.env`
console.log(chalk.bgCyan("[COMPLETE]\n"));

// Create data containers
console.log(chalk.bgCyan("[STEP]\t Creating blog containers"));
$.verbose = true;
await $`docker volume create --name=blog_content`;
await $`docker volume create --name=blogwatcher_database`;
await $`docker volume create --name=blogwatcher_dev_node_modules`;
await $`docker volume create --name=management_ui_dev_node_modules`;
await $`docker volume create --name=blog_nginx_proxy_certs`;
$.verbose = false;
console.log(chalk.bgCyan(chalk.bgCyan("[COMPLETE]\n")));

// Compile css
console.log(chalk.bgCyan("[STEP]\t Compiling SCSS to CSS"));

// Check node sass is installed
const nodeSassPath = await $`command -v node-sass`;
if (nodeSassPath.exitCode !== 0) {
  console.log("node-sass not found. Please install node-sass");
  process.exit(1);
}
await createTempContainer("temp_container", ["blog_content:/html"], "alpine");
$.verbose = true;
await $`node-sass -r -o ./public/css ./public`;
$.verbose = false;
const cssPath = path.resolve(root, "public/css");
for (const f of fs.readdirSync(cssPath)) {
  if (f.endsWith(".css")) {
    await $`docker cp ${path.resolve(cssPath, f)} temp_container:/html/static`;
  }
}
await deleteTempContainer("temp_container");
console.log(chalk.bgCyan("[COMPLETE]\n"));

console.log(chalk.bgCyan("[STEP]\t Moving static content to blog_content volume"));

const htmlDevelopment = {
  "./public/html/landing_development/index.html": "/html/index.html",
};

const htmlProduction = {
  "./public/html/landing_production/index.html": "/html/index.html",
};

const favicon = {
  "../nginxProxy/html/favicon.ico": "/html/static/favicon.ico",
};

const styles = {
  "./public/css/menu.css": "/html/static/menu.css",
  "./public/css/solarized.css": "/html/static/solarized.css",
  "./public/css/tiny_dark.css": "/html/static/tiny_dark.css",
  "./public/css/tiny_light.css": "/html/static/tiny_light.css",
  "./public/css/an-old-hope.css": "/html/static/an-old-hope.css",
};

const scripts = {
  "./public/js/index.js": "/html/static/index.js",
};

const media = {
  "./public/media/logo.png": "/html/static/logo.png",
  "./public/media/github.svg": "/html/static/github.svg",
  "./public/media/twitter.svg": "/html/static/twitter.svg",
  "./public/media/linkedin.svg": "/html/static/linkedin.svg",
  "./public/media/avatar.svg": "/html/static/avatar.svg",
};

const copyFiles = async (filesMap) => {
  for (const f of Object.keys(filesMap)) {
    const from = f;
    const to = filesMap[f];
    const fileName = path.basename(from);
    await $`docker cp ${from} temp_container:${to}`;
    console.log(`Copied ${fileName}`);
  }
};

const postInstall = async (files) => {
  const listOfFiles = Object.values(files);
  const fileNames = listOfFiles.map((f) => path.basename(f));
  await $`docker run --rm --name temp_container -v blog_content:/html fix_ownership_container chown node:node ${listOfFiles}`;
  await $`docker run --rm --name temp_container -v blog_content:/html fix_ownership_container chmod 777 ${listOfFiles}`;
  console.log(`chown and chmod ${fileNames.join(", ")}`);
};

// Create a build of the nginxProxy container which has the node user and group
$.quote = (v) => v;
await $`docker build --quiet -t fix_ownership_container -f ../nginxProxy/dockerfile ../nginxProxy`;
$.quote = q;

//  Make dist directory inside the blog_content volume
await $`docker run --rm --name temp_container -v blog_content:/html alpine mkdir -p /html/static`;

await createTempContainer("temp_container", ["blog_content:/html"], "alpine");
if (blogEnv === "development") {
  copyFiles(htmlDevelopment);
} else {
  copyFiles(htmlProduction);
}

await copyFiles(favicon);
await copyFiles(styles);
await copyFiles(scripts);
await copyFiles(media);

await deleteTempContainer("temp_container");

if (blogEnv === "development") {
  await postInstall(htmlDevelopment);
} else {
  await postInstall(htmlProduction);
}
await postInstall(favicon);
await postInstall(styles);
await postInstall(scripts);
await postInstall(media);

console.log("Completed copying media");

// await deleteTempContainer("temp_container");
console.log(chalk.bgCyan("[COMPLETE]\n"));

console.log(chalk.bgCyan("[STEP]\t Moving certificates to blog_nginx_proxy_certs volume"));
// certs expects symlinks to the actual certs
const certs = (
  await $`sudo find ${path.resolve(blogCertDirParsed.dir, blogCertDirParsed.base)} -type l`
).stdout
  .trim()
  .split("\n").filter((s) => /.*\.pem/.test(s));

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
