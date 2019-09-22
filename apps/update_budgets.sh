#!/bin/bash

SCRIPTDIR=`dirname $0`

cd "${SCRIPTDIR}/budget-analyzer" && \
git checkout master && \
cd budget-creator && \
git checkout master && \
./createBudgets.py && \
git add -A && \
git commit -m "automated budget updates" && \
git push origin master && \
cd .. && \
git add budget-creator/ && \
git commit -m "automated budget updates" && \
git push origin master && \
cd .. && \
git add budget-analyzer/ && \
git commit -m "automated budget updates" && \
git push origin master && \
echo 'SUCCESS!'
