
# The final file structure should look something like this:
# ├── auth                  => repo WIP SSO solution (not yet ready, will appear in the org when its ready)
# ├── blogScripts           => various scripts for spinning up the blog
# ├── blogWatcher           => repo that container the database / api for accessing page info
# ├── blogBuilder           => repo that builds the web pages for the blog
# ├── dist                  => (VOLUME) blogBuilder will dump its contents here
# ├── managementUI          => repo that provides the management react app for the blog
# ├── nginxProxy            => repo that provides a reverse proxy
# ├── development.yaml      => (SYMLINK) start the blog with development options
# ├── production.yaml       => (SYMLINK) start the blog with production options
# └── docker-compose.yaml   => (SYMLINK) start the blog. Combine with one of the above

# Link the docker files to spin up the blog to the parent directory
root=`pwd -P`
ln -s "$root/docker/development.yaml" ../development.yaml
ln -s "$root/docker/production.yaml" ../production.yaml
ln -s "$root/docker/docker-compose.yaml" ../docker-compose.yaml