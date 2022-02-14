bash urls.sh | parallel -j 64 bash sanity-test.sh > stress.logs
grep OK stress.logs | wc -l