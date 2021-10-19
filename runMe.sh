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

if [ -z "$BLOG_ENV" ]; then
    echo "Please set \$BLOG_ENV environment variable to \"production\" or \"development\""
    echo "If using a staging server then set \$BLOG_ENV to production"
    return 1
fi

if [ -z "$BLOG_CERT_DIR" ]; then
    echo "Please set \$BLOG_CERT_DIR environment variable to the directory that your Lets Encrypt or self signed certificates exist."
    echo "\tFor example to deploy development: \033[1mexport BLOG_CERT_DIR=\"../nginxProxy/keys/development\"\033[0m"
    echo "\tFor example to deploy production: \033[1mexport BLOG_CERT_DIR=\"/etc/letsencrypt/live/example.rolandw.dev\"\033[0m"
    return 1
fi

echo "BLOG_ENV: $BLOG_ENV"
echo "BLOG_CERT_DIR: $BLOG_CERT_DIR"

# add an empty line
echo ""

# Link the docker files to spin up the blog to the parent directory
echo "Linking docker compose scripts to root of blog..."
root=$(pwd -P)
echo "linking docker-compose.yaml" &
ln -s "$root/docker/docker-compose.yaml" ../docker-compose.yaml 2>/dev/null
echo "linking development.yaml" &
ln -s "$root/docker/development.yaml" ../development.yaml 2>/dev/null
echo "linking production.yaml" &
ln -s "$root/docker/production.yaml" ../production.yaml 2>/dev/null
echo "linking .dockerignore" &
ln -s "$root/docker/.dockerignore" ../.dockerignore 2>/dev/null
echo "[COMPLETE]\n"

sleep 0.25

echo "[STEP]\t Creating blog containers"
/usr/bin/docker volume create --name=blog_content
/usr/bin/docker volume create --name=blogwatcher_database
/usr/bin/docker volume create --name=blogwatcher_dev_node_modules
/usr/bin/docker volume create --name=management_ui_dev_node_modules
/usr/bin/docker volume create --name=blog_nginx_proxy_certs
echo "[COMPLETE]\n"

sleep 0.25

echo "[STEP]\t Moving static content to blog_content volume"
# Make dist directory inside the blog_content volume
/usr/bin/docker run --rm --name temp_container -v blog_content:/html alpine mkdir -p /html/static

# Move placeholder index.html to dist
/usr/bin/docker create --name temp_container -v blog_content:/html alpine >/dev/null
if [ $BLOG_ENV = "development" ]; then
    /usr/bin/docker cp ./public/html/landing_development/index.html temp_container:/html
else
    /usr/bin/docker cp ./public/html/landing_production/index.html temp_container:/html
fi
/usr/bin/docker rm temp_container >/dev/null

# Copy favicon and logo to root
/usr/bin/docker create --name temp_container -v blog_content:/html alpine >/dev/null
/usr/bin/docker cp ../nginxProxy/html/favicon.ico temp_container:/html/
/usr/bin/docker rm temp_container >/dev/null

# Copy styles to root
/usr/bin/docker create --name temp_container -v blog_content:/html alpine >/dev/null
/usr/bin/docker cp ./public/css/menu.css temp_container:/html/
/usr/bin/docker cp ./public/css/solarized.css temp_container:/html/
/usr/bin/docker cp ./public/css/tiny_dark.css temp_container:/html/
/usr/bin/docker cp ./public/css/tiny_light.css temp_container:/html/
/usr/bin/docker cp ./public/css/an-old-hope.css temp_container:/html/
/usr/bin/docker cp ./public/css/base temp_container:/html/
/usr/bin/docker rm temp_container >/dev/null
# Copy javascript to root
/usr/bin/docker create --name temp_container -v blog_content:/html alpine >/dev/null
/usr/bin/docker cp ./public/js/index.js temp_container:/html/
/usr/bin/docker rm temp_container >/dev/null
# Copy media to root
/usr/bin/docker create --name temp_container -v blog_content:/html alpine >/dev/null
/usr/bin/docker cp ./public/media/logo.png temp_container:/html/
/usr/bin/docker cp ./public/media/github.svg temp_container:/html/
/usr/bin/docker cp ./public/media/twitter.svg temp_container:/html/
/usr/bin/docker cp ./public/media/linkedin.svg temp_container:/html/
/usr/bin/docker rm temp_container >/dev/null
echo "[COMPLETE]\n"

sleep 0.25

echo "[STEP]\t Fixing file ownership in blog_content volume"
# Fix ownership issues from copying files in and stuff
# fix ownership from 1000:1000 to root:root
/usr/bin/docker run --rm --name temp_container -v blog_content:/html alpine chown -R root:root /html/
# change to -rwxrwxrwx for all files
/usr/bin/docker run --rm --name temp_container -v blog_content:/html alpine find /html -type f -exec chmod 777 {} \;
# change to -rwxrwxrwx for all directories
/usr/bin/docker run --rm --name temp_container -v blog_content:/html alpine find /html -type d -exec chmod 777 {} \;
echo "[COMPLETE]\n"

sleep 0.25

echo "[STEP]\t Moving certificates to blog_nginx_proxy_certs volume"
# the cert folder could container
# cert.pem
# chain.pem
# fullchain.pem
# privkey.pem

FILES=$(sudo find $BLOG_CERT_DIR -name "*.pem")
for d in $FILES; do
    # resolve the symlink because letsencrypt uses symlinks to point to active certs
    SOURCE=$(sudo realpath $d)
    FILENAME=$(basename $SOURCE)

    # copy the cert file to the volume
    /usr/bin/docker create --name temp_container -v "blog_nginx_proxy_certs:/keys" alpine >/dev/null
    sudo /usr/bin/docker cp -L "$SOURCE" temp_container:/keys
    /usr/bin/docker rm temp_container >/dev/null
    echo "Copied $FILENAME to blog_nginx_proxy_certs"

    # the cert copies over as cert1.pem not cert.pem so i create a symlink cert.pem to point to it
    # echo "installing symlink to $FILENAME"

    # check if the name is already correct (no need to symlink)
    if [ "$FILENAME" != "cert.pem" ]; then
        continue
    fi

    if [ "$FILENAME" != "chain.pem" ]; then
        continue
    fi
    if [ "$FILENAME" != "fullchain.pem" ]; then
        continue
    fi

    if [ "$FILENAME" != "privkey.pem" ]; then
        continue
    fi

    # if we get there then the filename is likely something like "cert1.pem" and we need to symlink "cert.pem" to it.
    if echo "$FILENAME" | grep -q "cert"; then
        docker run --name "temp_container" --rm -v "blog_nginx_proxy_certs:/keys" busybox ln -s -f "/keys/$FILENAME" "/keys/cert.pem" >/dev/null
        echo "installed cert.pem symlink to $FILENAME"
    fi

    if echo "$FILENAME" | grep -q "chain"; then
        docker run --name "temp_container" --rm -v "blog_nginx_proxy_certs:/keys" busybox ln -s -f "/keys/$FILENAME" "/keys/chain.pem" >/dev/null
        echo "installed chain.pem symlink to $FILENAME"
    fi

    echo "$FILENAME does not equal fullchain.pem"
    if echo "$FILENAME" | grep -q "fullchain"; then
        docker run --name "temp_container" --rm -v "blog_nginx_proxy_certs:/keys" busybox ln -s -f "/keys/$FILENAME" "/keys/fullchain.pem" >/dev/null
        echo "installed fullchain.pem symlink to $FILENAME"
    fi

    if echo "$FILENAME" | grep -q "privkey"; then
        docker run --name "temp_container" --rm -v "blog_nginx_proxy_certs:/keys" busybox ln -s -f "/keys/$FILENAME" "/keys/privkey.pem" >/dev/null
        echo "installed privkey.pem symlink to $FILENAME"
    fi

done
echo "[COMPLETE]\n"

sleep 0.25

echo "[STEP]\t Creating gateway_network"

# if the gateway_network does not exist then create it
if ! /usr/bin/docker network inspect gateway_network >/dev/null 2>&1; then
    echo "Creating gateway_network"
    /usr/bin/docker network create gateway_network
fi

echo "[COMPLETE]\n"

sleep 0.25

# echo "Moving nginx configs to blog_nginx_sites_enabled volume"
# /usr/bin/docker create --name temp_container -v blog_nginx_sites_enabled:/data alpine
# if [ $BLOG_ENV = "development" ]; then
#     /usr/bin/docker cp ../nginxProxy/development/sites-available/. temp_container:/data
# else
#     /usr/bin/docker cp ../nginxProxy/production/sites-available/. temp_container:/data
# fi
# /usr/bin/docker rm temp_container
# echo "[COMPLETE]\n"

# sleep 0.25

# echo "Building management UI and installing it to blog_content volume"
# cd ../managementUI/
# /usr/bin/docker build -t management_ui .
# docker run management_ui npm run build

# # make /admin folder in volume
# /usr/bin/docker run --name temp_container -v blog_content:/html alpine mkdir /html/admin

# /usr/bin/docker rm temp_container

# # copy build app to volume mount
# docker run --name management_ui_build_container \
# -v blog_content:/html management_ui cp -r /usr/src/app/build/. /html/admin

# /usr/bin/docker rm management_ui_build_container
# echo "[COMPLETE]\n"
