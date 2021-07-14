
# The final file structure should look something like this:
# ├── auth                  => repo WIP SSO solution (not yet ready, will appear in the org when its ready)
# ├── blogScripts           => various scripts for spinning up the blog
# ├── blogWatcher           => repo that container the database / api for accessing page info
# ├── blogBuilder           => repo that builds the web pages for the blog
# ├── dist                  => (VOLUME) blogBuilder will dump its contents here
# ├── managementUI          => repo that provides the management react app for the blog
# ├── nginxProxy            => repo that provides a reverse proxy
# ├── development.yaml      => (SYMLINK) start the blog with development options
# ├── .dockerignore         => (SYMLINK) docker ignore file
# ├── production.yaml       => (SYMLINK) start the blog with production options
# └── docker-compose.yaml   => (SYMLINK) start the blog. Combine with one of the above

if [ -z "$BLOG_ENV" ]
then
      echo "Please set \$BLOG_ENV environment variable to \"production\" or \"development\""
      return 1
fi

# Link the docker files to spin up the blog to the parent directory
echo "Linking docker compose scripts to root of blog..."
root=`pwd -P`
echo "linking docker-compose.yaml" ln -s "$root/docker/docker-compose.yaml" ../docker-compose.yaml 2> /dev/null
echo "linking development.yaml" && ln -s "$root/docker/development.yaml" ../development.yaml 2> /dev/null
echo "linking production.yaml" ln -s "$root/docker/production.yaml" ../production.yaml 2> /dev/null
echo "linking .dockerignore" ln -s "$root/docker/.dockerignore" ../.dockerignore 2> /dev/null
echo "done ================================================"

sleep 1

echo "Creating blog containers"
/usr/bin/docker volume create --name=blog_content
/usr/bin/docker volume create --name=blogwatcher_database
/usr/bin/docker volume create --name=blogwatcher_dev_node_modules
/usr/bin/docker volume create --name=management_ui_dev_node_modules
/usr/bin/docker volume create --name=blog_nginx_proxy_certs
/usr/bin/docker volume create --name=blog_nginx_sites_enabled
echo "done ================================================"

sleep 1

echo "Moving static content to blog_content volume"
/usr/bin/docker run --name temp_container -v blog_content:/html alpine mkdir /html/static # make static directory
/usr/bin/docker rm temp_container

/usr/bin/docker create --name temp_container -v blog_content:/html alpine
/usr/bin/docker cp ../nginxProxy/html/favicon.ico temp_container:/html/ # copy favicon to static
/usr/bin/docker rm temp_container

sleep 1

echo "Moving certificates to blog_nginx_proxy_certs volume"
/usr/bin/docker create --name temp_container -v blog_nginx_proxy_certs:/keys alpine
if [ $BLOG_ENV = "development" ]; then
    /usr/bin/docker cp ../nginxProxy/keys/development/. temp_container:/keys
else
    /usr/bin/docker cp ../nginxProxy/keys/production/. temp_container:/keys
fi
/usr/bin/docker rm temp_container
echo "done ================================================"

sleep 1

echo "Moving nginx configs to blog_nginx_sites_enabled volume"
/usr/bin/docker create --name temp_container -v blog_nginx_sites_enabled:/data alpine
if [ $BLOG_ENV = "development" ]; then
    /usr/bin/docker cp ../nginxProxy/development/sites-available/. temp_container:/data
else
    /usr/bin/docker cp ../nginxProxy/production/sites-available/. temp_container:/data
fi
/usr/bin/docker rm temp_container
echo "done ================================================"

sleep 1

echo "Building management UI and installing it to blog_content volume"
cd ../managementUI/
/usr/bin/docker build -t management_ui .
docker run management_ui npm run build

# make /admin folder in volume
/usr/bin/docker run --name temp_container -v blog_content:/html alpine mkdir /html/admin

/usr/bin/docker rm temp_container

# copy build app to volume mount
docker run --name management_ui_build_container \
-v blog_content:/html management_ui cp -r /usr/src/app/build/. /html/admin

/usr/bin/docker rm management_ui_build_container
echo "done ================================================"

sleep 1

# ! Depricated because the blog should not handle non TLD requests
# move non TLD index pages to blog_content volume
# /usr/bin/docker create --name temp_container -v blog_content:/html alpine
# /usr/bin/docker cp ../nginxProxy/html/landing_development temp_container:/html
# /usr/bin/docker cp ../nginxProxy/html/landing_production temp_container:/html
