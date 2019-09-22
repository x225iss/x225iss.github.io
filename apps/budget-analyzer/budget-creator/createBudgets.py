#!/usr/bin/python

import os, json, gspread, requests, time, operator, collections
from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

###################################
SHEETSTOPROCESS = ['June 2019', 'July 2019']
###################################

def getLevel(junctionString):
    return 1000 - junctionString.count('*'), str(junctionString.split('* ')[-1])

def getCellValue(cellVal):
    print 'Processing cell %s...' % cellVal
    try:
        returnStr = str(monthSheet.acell(cellVal).value)
        time.sleep(1.01) # 0.25
    except gspread.exceptions.APIError:
        print 'ERROR: Quota exceeded!'
        returnStr = ''
    return returnStr

def addNode(nodeName, nodeList):
    if nodeName in nodeList:
        return
    else:
        nodeList.append(nodeName)

def addBranch(parent, child, amount, moneyList, rootName):
    found = False
    for moneyLeaf in moneyList:
        if moneyLeaf[0] == parent and moneyLeaf[1] == child:
            moneyLeaf[2] += amount
            found = True
            break
    if not found:
        moneyTree.append([parent, child, amount])
    if parent == rootName:
        return
    else:
        # because each child only has ONE parent, this works
        for moneyLeaf in moneyList:
            if moneyLeaf[1] == parent:
                return addBranch(moneyLeaf[0], moneyLeaf[1], amount, moneyList, rootName)

PWD = os.path.dirname(os.path.abspath(__file__))
CLIENTFILE = os.path.join(PWD, 'res', 'Budget-Sheet-Access-Owner.json')
BUDGETSHEETKEY = '1ZUvCMo0U-wm0aB0eMb00MyHsrzWovzSuBkgx0zqnbZw'
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
INDEXJSON = os.path.join(PWD, 'budgets', 'budgetList.json')

try:
    with open(INDEXJSON, 'r') as budgetList:
        budgetListDict = json.load(budgetList)
        completedBudgets = budgetListDict['budgets']
except:
    completedBudgets = []

for completedBudget in completedBudgets:
    if completedBudget in SHEETSTOPROCESS:
        SHEETSTOPROCESS.remove(completedBudget)

credentials = service_account.Credentials.from_service_account_file(
    CLIENTFILE)
scoped_credentials = credentials.with_scopes(SCOPES)

gc = gspread.Client(auth=scoped_credentials)
gc.session = AuthorizedSession(scoped_credentials)

budgetSheet = gc.open_by_key(BUDGETSHEETKEY)

for STP in SHEETSTOPROCESS:
    print '==== %s ====' % STP

    incomeSourceNames = [] # for adding income links at the end
    allNodes = [] # for node json construction
    moneyTree = [] # list of ["parent", "child", amount] link lists
    nodeStack = [] # for constructing the moneyTree

    monthSheet = budgetSheet.worksheet(STP)

    # Populate income source names list
    income_idx = 2
    while True:
        incomeSourceString = getCellValue('A%d' % income_idx)
        if incomeSourceString == '':
            break
        incomeSourceNames.append(incomeSourceString)
        addNode(incomeSourceString, allNodes)
        income_idx += 1

    # Populate initial moneyTree junctions
    junction_idx = 2
    rootJunctionName = getCellValue('B2') # root of the tree
    while True:
        junctionString = getCellValue('B%d' % junction_idx)
        if junctionString == '':
            break
        level, junctionString = getLevel(junctionString)
        addNode(junctionString, allNodes)
        while len(nodeStack) > 0 and level >= nodeStack[-1][0]:
            nodeStack.pop()
        if len(nodeStack) > 0:
            moneyTree.append([nodeStack[-1][1], junctionString, 0.0])
        nodeStack.append([level, junctionString])
        junction_idx += 1

    # Add branches from the expense logs
    expense_idx = 2
    while True:
        parent = getCellValue('G%d' % expense_idx)
        if parent == '':
            break
        level, parent = getLevel(parent)
        child = getCellValue('H%d' % expense_idx)
        amount = float(getCellValue('I%d' % expense_idx))
        addNode(parent, allNodes)
        addNode(child, allNodes)
        addBranch(parent, child, amount, moneyTree, rootJunctionName)
        expense_idx += 1

    # Finally, add income links feeding into the root node
    income_idx = 2
    while True:
        parent = getCellValue('D%d' % income_idx)
        if parent == '':
            break
        amount = float(getCellValue('E%d' % income_idx))
        found = False
        for moneyLeaf in moneyTree:
            if moneyLeaf[0] == parent and moneyLeaf[1] == rootJunctionName:
                moneyLeaf[2] += amount
                found = True
                break
        if not found:
            moneyTree.append([parent, rootJunctionName, amount])
        income_idx += 1

    # Write all data to json
    BUDGETJSONFILE = os.path.join(PWD, 'budgets', '%s.json' % STP)
    budgetDict = {}
    budgetDict['nodes'] = []
    for nodeName in allNodes:
        budgetDict['nodes'].append({'name': nodeName})
    budgetDict['links'] = []
    for moneyLeaf in moneyTree:
        parent = allNodes.index(moneyLeaf[0])
        child = allNodes.index(moneyLeaf[1])
        amount = moneyLeaf[2]
        if amount > 0:
            budgetDict['links'].append({'source': parent, 'target': child, 'value': amount})

    with open(BUDGETJSONFILE, 'w') as budgetJSON:
        json.dump(budgetDict, budgetJSON)

    completedBudgets.append(STP)

with open(INDEXJSON, 'w') as budgetList:
    json.dump({"budgets": completedBudgets}, budgetList)
