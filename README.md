# Blog Scripts

Scripts n stuff to manage the blog containers.

Run `./runMe.sh` to symlink the docker files required for starting the blog to their correct location.

The final file structure should look something like this:

```none
├── auth                  => repo WIP SSO solution (not yet ready, will appear in the org when its ready)
├── blogScripts           => various scripts for spinning up the blog
├── blogWatcher           => repo that container the database / api for accessing page info
├── blogBuilder           => repo that builds the web pages for the blog
├── managementUI          => repo that provides the management react app for the blog
├── nginxProxy            => repo that provides a reverse proxy
├── development.yaml      => (SYMLINK) start the blog with development options
├── production.yaml       => (SYMLINK) start the blog with production options
└── docker-compose.yaml   => (SYMLINK) start the blog. Combine with one of the above
```

To work on public asset stuff, cd into public and run the following command to watch your sass files.

```none
cd ./public
nodemon -e scss --exec node-sass -r -o ./css .
```
