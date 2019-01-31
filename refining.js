var refiningApp = angular.module('refiningApp', []);

function extractPrices(eveCentralData) {
    var priceMap = {};
    for(let i in eveCentralData) {
        let entry = eveCentralData[i].sell;
        let type = entry.forQuery.types[0];
        let price = entry.fivePercent;
        priceMap[type] = price;
    }
    return priceMap;
}

function calculateYield(ore, mineral, efficiency) {
    let content = ore.minerals[mineral];
    if(!content) {
        return 0;
    }
    return content * efficiency;
};

function calculateContributedMinerals(requirements, ore, efficiency) {
    var contributed = {};
    var total = 0;
    
    for(var mineral in ore.minerals) {
        if(mineral in requirements) {
            let target = requirements[mineral];
            
            let yield = calculateYield(ore, mineral, efficiency);
            if(yield > target) {
                yield = target;
            }
            
            if(yield > 0) {
                contributed[mineral] = yield;
                total = total + contributed[mineral];
            }
        }
    }
    return {
        minerals: contributed,
        total: total
    };
};

function findLimit(required, contributed, efficiency) {
    let limits = [];
    for(let mineral in contributed.minerals) {
        if(mineral in required.minerals) {
            limits.push(required.minerals[mineral]/(contributed.minerals[mineral]*efficiency));
        }
    }
    let limit = limits.reduce((least, next) => ((least > next && next > 0) ? next : least), Number.MAX_SAFE_INTEGER);
    return limit > 1 ? Math.floor(limit) : 1;
}

refiningApp.controller('RefiningController', ['$scope', '$http', function RefiningController($scope, $http) {
    $scope.ores = eveData.moon_ores;
    $scope.oreList = Object.keys($scope.ores);
    $scope.minerals = eveData.minerals;
    $scope.mineralList = Object.keys($scope.minerals);
    $scope.skill_range = [0, 1, 2, 3, 4, 5]
    $scope.skill_reproc = 5;
    $scope.skill_reproc_efficiency = 5;
    $scope.skill_ore_spec = 4;
    $scope.haulingOverhead = 1000;
    
    $scope.getPrices = function() {
        let marketIdList = [];
        for(let ore in $scope.ores) {
            let oreId = $scope.ores[ore].id.ore;
            if(!!oreId) {
                marketIdList.push(oreId);
            }
            oreId = $scope.ores[ore].id.compressed;
            if(!!oreId) {
                marketIdList.push(oreId);
            }
        }
        for(let mineral in $scope.minerals) {
            marketIdList.push($scope.minerals[mineral].id)
        }
        
        $http.get('https://api.evemarketer.com/ec/marketstat/json',
                                    {
                                        params: {
                                            typeid: marketIdList.join(','),
                                            usesystem: 30000142             //Jita
                                        }
                                    }
        ).then(function(response) {
            $scope.prices = extractPrices(response.data);
        },
        function(error) {
            console.log('Error getting prices:', error);
        });
    }
    
    $scope.getPrices();
    
    $scope.getRefineryBase = function(ore) {
        return 0.594048;    //TODO: actual calculation based on service and rig
    };
    
    $scope.getSkillModifiers = function(ore) {
        return (1+($scope.skill_reproc * 0.03)) * (1+($scope.skill_reproc_efficiency * 0.02)) * (1+($scope.skill_ore_spec * 0.02));
    };
    
    $scope.getRefiningEfficiency = function(ore) {
        let skill_base = $scope.getRefineryBase(ore) * $scope.getSkillModifiers(ore);
        if($scope.implant_efficiency > 1.0) {
            skill_base = skill_base * $scope.implant_efficiency;
        }
        return skill_base;
    };
    
    $scope.formatPrice = function(price) {
        if(price) {
            return price.toLocaleString('en-US', {maximumFractionDigits: 2});
        }
        else {
            return '-';
        }
    }
    
    $scope.singletonYield = function(ore, mineral) {
        return Math.floor(calculateYield(ore, mineral, $scope.getRefiningEfficiency(ore)));
    };
    
    $scope.priceMinerals = function(minerals) {
        let value = 0;
        //Cutoff while we wait for data
        if($scope.prices) {
            for(let mineral in minerals) {
                value = value + minerals[mineral] * $scope.prices[$scope.minerals[mineral].id];
            }
        }
        return value;
    }
    
    $scope.priceOre = function(ores) {
        let value = 0;
        //Cutoff while we wait for data
        if($scope.prices) {
            for(let ore in ores) {
                if(ores[ore] > 0) {
                    value = value + ores[ore] * $scope.prices[$scope.ores[ore].id.compressed];
                }
            }
        }
        return value;
    }
    
    $scope.calculateMineralValue = function(ore) {
        let oreData = $scope.ores[ore];
        let output = calculateContributedMinerals(oreData.minerals, oreData, $scope.getRefiningEfficiency(oreData));
        let value = $scope.priceMinerals(output.minerals);
        return value;
    }
    
    $scope.calculateMineralEfficiency = function(ore) {
        let oreData = $scope.ores[ore];
        return $scope.calculateMineralValue(ore) / (oreData.volume.ore * 100);
    }
    
    $scope.calculateExportEfficiency = function(ore) {
        let oreData = $scope.ores[ore];
        if($scope.prices && (oreData.id.compressed in $scope.prices)) {
            return $scope.prices[oreData.id.compressed] / (oreData.volume.ore * 100);
        }
        else {
            return undefined;
        }
    }
    
    //If, in the future, we want to implement alternate scoring methods, here is where to do it.
    var scoreOre = function(ore, output) {
        //By volume
        //return output.total / ore.volume.compressed;
        //By value per cost
        let value = $scope.priceMinerals(output.minerals);
        let cost = $scope.prices[ore.id.compressed];
        if(cost == 0) {
            console.log('Zero ore cost detected. bailing out:', ore, cost);
            return 0;
        }
        let overhead = ore.volume.compressed * $scope.haulingOverhead;
        console.log('scoreOre');
        console.log(ore, output);
        console.log('value:', value, 'cost:', cost, 'overhead:', overhead);
        console.log('score:', value / (cost + overhead));
        console.log('absolute:', cost + overhead - value);
        return value / (cost + overhead);
    }
    
    var scoreMinerals = function(output) {
        //By volume
        //return 1/0.01;
        //By value per cost
        let value = $scope.priceMinerals(output.minerals);
        let overhead = output.total * $scope.haulingOverhead * 0.01;
        console.log('scoreMinerals');
        console.log(output);
        console.log('score:', value / (value + overhead));
        console.log('absolute:', overhead);
        return value / (value + overhead);
    }
    
    $scope.calculateCompressedOre = function(mineralsRequired) {
        let refining = {};
        let oreData = $scope.ores;
        let ores = {};
        let minerals = {};
        let output = {};
        
        for(let ore of $scope.oreList) {
            refining[ore] = $scope.getRefiningEfficiency(oreData[ore]);
            ores[ore] = 0;
        }
        
        for(let mineral of $scope.mineralList) {
            output[mineral] = 0;
        }
        
        //Hardcoded order because manually unrolling the minerals makes for a simpler, greedy algorithm
        while(true) {
            let remainder = {
                minerals: {},
                total: 0
            };
            for(let mineral in mineralsRequired) {
                if(mineral in output) {
                    let amount = Math.ceil(mineralsRequired[mineral] - output[mineral]);
                    if(amount > 0) {
                        remainder.minerals[mineral] = amount;
                        remainder.total = remainder.total + amount;
                    }
                    //else 0 or negative and don't include it.
                }
                else {
                    let amount = mineralsRequired[mineral];
                    remainder.minerals[mineral] = amount;
                    remainder.total = remainder.total + amount;
                }
            }
            
            if(remainder.total > 0) {
                let bestOption = null;
                let bestScore = scoreMinerals(remainder);
                let score = 0;
                for(let ore in oreData) {
                    score = scoreOre(oreData[ore], calculateContributedMinerals(remainder.minerals, oreData[ore], refining[ore]));
                    if(score > bestScore) {
                        bestOption = ore;
                        bestScore = score;
                    }
                }
                
                if(bestOption != null) {
                    let increment = findLimit(remainder, oreData[bestOption], refining[bestOption]);
                    console.log('adding ' + increment + ' ' + oreData[bestOption].name);
                    ores[bestOption] = ores[bestOption] + increment;
                    let oreMinerals = oreData[bestOption].minerals;
                    for(let mineral in oreMinerals) {
                        output[mineral] = output[mineral] + (oreMinerals[mineral] * refining[bestOption] * increment);
                    }
                }
                else {
                    //We could probably just direct assign it, but we need to iterate for output anyway.
                    let mineralsToGet = remainder.minerals
                    for(let mineral in mineralsToGet) {
                        if(!(mineral in minerals)) {
                            minerals[mineral] = mineralsToGet[mineral];
                        }
                        else {
                            minerals[mineral] = minerals[mineral] + mineralsToGet[mineral];
                        }
                        if(!(mineral in output)) {
                            output[mineral] = mineralsToGet[mineral];
                        }
                        else {
                            output[mineral] = output[mineral] + mineralsToGet[mineral];
                        }
                    }
                }
            }
            else {
                //Clean up output
                for(let mineral in output) {
                    output[mineral] = Math.floor(output[mineral]);
                }
                for(let mineral in minerals) {
                    output[mineral] = Math.floor(output[mineral]);
                }
                console.log('ore: ', ores);
                console.log('minerals: ', minerals);
                console.log('output: ', output);
                return {
                    ores: ores,
                    minerals: minerals,
                    output: output
                };
            }
        }
    };
    
    $scope.requestedMinerals = {};
    for(let mineral of $scope.mineralList) {
        $scope.requestedMinerals[mineral] = 0;
    }
    
    $scope.calculateCompression = function() {
        $scope.compressedOre = $scope.calculateCompressedOre($scope.requestedMinerals);
    }
}]);