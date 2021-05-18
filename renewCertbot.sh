# Create cert instructions
# https://certbot.eff.org/lets-encrypt/debianbuster-nginx

# To renew run this command
sudo certbot certonly --manual --manual-public-ip-logging-ok --preferred-challenges dns-01 --server https://acme-v02.api.letsencrypt.org/directory -d "*.rolandw.dev" -d rolandw.dev
