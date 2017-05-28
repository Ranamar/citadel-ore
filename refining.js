var refiningApp = angular.module('refiningApp', []);

function calculateYield(ore, mineral, efficiency) {
    let content = ore.minerals[mineral];
    if(!content) {
        return 0;
    }
    return content * efficiency;
};

//If, in the future, we want to implement alternate scoring methods, here is where to do it.
function scoreOre(ore, output) {
    return output.total / ore.volume.compressed;
}
function calculateContributedMinerals(requirements, allocated, ore, efficiency) {
    var contributed = {};
    var total = 0;
    
    for(var mineral in ore.minerals) {
        if(mineral in requirements) {
            //Calculate remaining minerals needed
            let target = requirements[mineral];
            if(mineral in allocated) {
                target = target - allocated[mineral];
                if(target <= 0) {
                    //Bail out early if we have enough of this mineral
                    continue;
                }
            }
            
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

function findLimit(required, allocated, contributed) {
    let limits = [];
    for(let mineral in contributed.minerals) {
        if(mineral in required && mineral in allocated) {
            limits.push((required[mineral] - allocated[mineral])/contributed.minerals[mineral]);
        }
    }
    let limit = limits.reduce((least, next) => ((least > next && next > 0) ? next : least), Number.MAX_SAFE_INTEGER);
    return limit > 1 ? Math.floor(limit) : 1;
}

refiningApp.controller('RefiningController', function RefiningController($scope) {
    $scope.oreList = ['arkonor', 'bistot', 'crokite', 'spodumain', 'dark_ochre', 'gneiss', 'hedbergite', 'hemorphite', 'jaspet', 'kernite', 'omber', 'plagioclase', 'pyroxeres', 'scordite', 'veldspar'];
    $scope.ores = data.ores;
    $scope.mineralList = ['tritanium', 'pyerite', 'mexallon', 'isogen', 'nocxium', 'zydrine', 'megacyte'];
    $scope.minerals = data.minerals;
    $scope.rigs = ['HS'];
    $scope.skill_range = [0, 1, 2, 3, 4, 5]
    $scope.skill_reproc = 5;
    $scope.skill_reproc_efficiency = 5;
    $scope.skill_ore_spec = 4;
    
    $scope.getRefineryBase = function(ore) {
        if($scope.rigs.includes('HS') && ore.region == 'HS' ||
            $scope.rigs.includes('LNS') &&
            (ore.region == 'LS' || ore.region == 'NS')
        ) {
            return 0.58;
        }
        else {
            return 0.5;
        }
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
    
    $scope.singletonYield = function(ore, mineral) {
        return Math.floor(calculateYield(ore, mineral, $scope.getRefiningEfficiency(ore)));
    };
    
    $scope.calculateCompressedOre = function(mineralsRequired) {
        var refining = {};
        let oreData = $scope.ores;
        let ores = {};
        let output = {};
        
        for(let ore of $scope.oreList) {
            refining[ore] = $scope.getRefiningEfficiency(oreData[ore]);
            ores[ore] = 0;
        }
        
        for(let mineral of $scope.mineralList) {
            output[mineral] = 0;
        }
        
        //This is a helper for selecting and logging ores.
        let addSomeOre = function(options, ores, minerals, required) {
            let bestOption = null;
            let bestScore = 0;
            let score = 0;
            
            for(let option in options) {
                if(bestOption === null) {
                    bestOption = option;
                    //bestScore = scoreOre(required, minerals, oreData[option], refining[option]);
                    bestScore = scoreOre(oreData[option], options[option]);
                }
                else {
                    //let score = scoreOre(required, minerals, oreData[option], refining[option]);
                    score = scoreOre(oreData[option], options[option]);
                    if(score > bestScore) {
                        bestOption = option;
                        bestScore = score;
                    }
                }
            }
            
            let increment = findLimit(mineralsRequired, output, options[bestOption]);
            ores[bestOption] = ores[bestOption] + increment;
            let oreMinerals = oreData[bestOption].minerals;
            for(let mineral in oreMinerals) {
                minerals[mineral] = minerals[mineral] + (oreMinerals[mineral] * refining[bestOption] * increment);
            }
        };
        
        //Hardcoded order because manually unrolling the minerals makes for a simpler, greedy algorithm
        while(true) {
            if(mineralsRequired.megacyte > output.megacyte) {
                let options = {
                    arkonor: calculateContributedMinerals(mineralsRequired, output, oreData.arkonor, refining.arkonor),
                    bistot: calculateContributedMinerals(mineralsRequired, output, oreData.bistot, refining.bistot)
                };
                addSomeOre(options, ores, output, mineralsRequired);
            }
            else if(mineralsRequired.zydrine > output.zydrine) {
                let options = {
                    bistot: calculateContributedMinerals(mineralsRequired, output, oreData.bistot, refining.bistot),
                    hedbergite: calculateContributedMinerals(mineralsRequired, output, oreData.hedbergite, refining.hedbergite),
                    hemorphite: calculateContributedMinerals(mineralsRequired, output, oreData.hemorphite, refining.hemorphite),
                    jaspet: calculateContributedMinerals(mineralsRequired, output, oreData.jaspet, refining.jaspet)
                }
                addSomeOre(options, ores, output, mineralsRequired);
            }
            else if(mineralsRequired.nocxium > output.nocxium) {
                let options = {
                    crokite: calculateContributedMinerals(mineralsRequired, output, oreData.crokite, refining.crokite),
                    dark_ochre: calculateContributedMinerals(mineralsRequired, output, oreData.dark_ochre, refining.dark_ochre),
                    hedbergite: calculateContributedMinerals(mineralsRequired, output, oreData.hedbergite, refining.hedbergite),
                    hemorphite: calculateContributedMinerals(mineralsRequired, output, oreData.hemorphite, refining.hemorphite),
                    jaspet: calculateContributedMinerals(mineralsRequired, output, oreData.jaspet, refining.jaspet),
                    pyroxeres: calculateContributedMinerals(mineralsRequired, output, oreData.pyroxeres, refining.pyroxeres)
                }
                addSomeOre(options, ores, output, mineralsRequired);
            }
            else if(mineralsRequired.isogen > output.isogen) {
                let options = {
                    spodumain: calculateContributedMinerals(mineralsRequired, output, oreData.spodumain, refining.spodumain),
                    dark_ochre: calculateContributedMinerals(mineralsRequired, output, oreData.dark_ochre, refining.dark_ochre),
                    gneiss: calculateContributedMinerals(mineralsRequired, output, oreData.gneiss, refining.gneiss),
                    hedbergite: calculateContributedMinerals(mineralsRequired, output, oreData.hedbergite, refining.hedbergite),
                    hemorphite: calculateContributedMinerals(mineralsRequired, output, oreData.hemorphite, refining.hemorphite),
                    kernite: calculateContributedMinerals(mineralsRequired, output, oreData.kernite, refining.kernite),
                    omber: calculateContributedMinerals(mineralsRequired, output, oreData.omber, refining.omber)
                }
                addSomeOre(options, ores, output, mineralsRequired);
            }
            else if(mineralsRequired.mexallon > output.mexallon) {
                let options = {
                    spodumain: calculateContributedMinerals(mineralsRequired, output, oreData.spodumain, refining.spodumain),
                    gneiss: calculateContributedMinerals(mineralsRequired, output, oreData.gneiss, refining.gneiss),
                    jaspet: calculateContributedMinerals(mineralsRequired, output, oreData.jaspet, refining.jaspet),
                    kernite: calculateContributedMinerals(mineralsRequired, output, oreData.kernite, refining.kernite),
                    plagioclase: calculateContributedMinerals(mineralsRequired, output, oreData.plagioclase, refining.plagioclase),
                    pyroxeres: calculateContributedMinerals(mineralsRequired, output, oreData.pyroxeres, refining.pyroxeres)
                }
                addSomeOre(options, ores, output, mineralsRequired);
            }
            else if(mineralsRequired.pyerite > output.pyerite) {
                let options = { scordite : calculateContributedMinerals(mineralsRequired, output, oreData.scordite, refining.scordite) };
                addSomeOre(options, ores, output, mineralsRequired);
            }
            else if(mineralsRequired.tritanium > output.tritanium) {
                let options = { veldspar : calculateContributedMinerals(mineralsRequired, output, oreData.veldspar, refining.veldspar) };
                addSomeOre(options, ores, output, mineralsRequired);
            }
            else {
                console.log('ore: ', ores);
                console.log('minerals: ', output);
                for(let mineral in output) {
                    output[mineral] = Math.floor(output[mineral]);
                }
                return {
                    ores: ores,
                    minerals: output
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
});