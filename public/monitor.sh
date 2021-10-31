#!/usr/bin/env bash

# trap ctrl-c and call ctrl_c()
trap ctrl_c INT

function ctrl_c() {
    echo "** Trapped CTRL-C"
    /usr/bin/docker rm temp_container
}

# start temp container to place files in the volume
/usr/bin/docker create --name temp_container -v blog_content:/html alpine

# every time the file is saved on the host, render the scss to css and copy to the volume
nodemon -e scss --exec 'node-sass -r -o ./dist . && for f in ./dist/*; do /usr/bin/docker cp "$f" temp_container:/html/static; done'
