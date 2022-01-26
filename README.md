# Blog Scripts

Scripts n stuff to manage the blog containers.

```none
npm install -g zx
```

Then run `./runMe.mjs` to bootstrap the blog.

## How Do Things Work?

Running the `runMe.mjs` script will do the following things.

1. Symlink the compose scripts from this repo to `../` for running them
2. Symlink the `.env` file from this repo to `../`, this provides some limited information (port numbers) to the compose scripts
3. Create docker volumes for content, keys, and databases
4. Compile blog sass to css
5. Move the index.html and favicon.ico to the content volume
6. Move the compiled css, scripts, and media to the content volume
7. Correctly copy and symlink lets encrypt certificates to the keys volume
8. Create a gateway_network for the blog to operate on within docker

## How Do I Change A Port Number?

If you have a clashing port the blog will not start, to fix this edit `.env` and change the port numbers.

The docker-compose files will source this file to get the port numbers and pass them along as environment variables to node applications.

The nginx proxy is a special case however, it sources its port numbers from `.env` however instead of reading from the environment as it goes,
part of the build process bakes (using sed) the port numbers into the nginx config file. So if you need to update the port numbers in the nginx config file make sure to rebuild it each time.

## Working on SCSS in Real Time

To work on public asset stuff, cd into public and run the following command to watch your sass files.

```none
cd ./public
nodemon -e scss --exec node-sass -r -o ./css .
```
