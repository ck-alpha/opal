var ORDERING =  '[location[0].category, location[0].hospital, location[0].ward, location[0].bed]';

function clone(obj) {
	if (typeof obj == 'object') {
		return $.extend(true, {}, obj);
	} else {
		return obj;
	}
};

function getKeys(obj) {
	var keys = [];
	for (var key in obj) {
		if (obj.hasOwnProperty(key)) {
			keys.push(key);
		}
	}
	return keys;
}

var app = angular.module('opalApp', ['$strap.directives']);

// See http://stackoverflow.com/questions/8302928/angularjs-with-django-conflicting-template-tags
app.config(function($interpolateProvider) {
	$interpolateProvider.startSymbol('[[');
	$interpolateProvider.endSymbol(']]');
});

app.controller('TableCtrl', function($scope, $http, $filter) {
	var state = 'normal';

	$scope.rows = [];

	$scope.rix = 0; // row index
	$scope.cix = 0; // column index
	$scope.iix = 0; // item index

	$scope.mouseRix = -1; // index of row mouse is currently over
	$scope.mouseCix = -1; // index of column mouse is currently over


	$http.get('schema/').success(function(data) {
		var option_lists = data.option_lists;
		var option_names = getKeys(option_lists);
		var option_name;
		var columnName;

		$scope.columns = data.columns;

		$http.get('patient/').success(function(rows) {
			for (var rix = 0; rix < rows.length; rix++) {
				for (var cix = 0; cix < $scope.columns.length; cix++) {
					columnName = $scope.columns[cix].name;
					if ($scope.columns[cix].single) {
						rows[rix][columnName] = [rows[rix][columnName]];
					} else {
						rows[rix][columnName].push({patient: rows[rix].id});
					}
				}
			}
			rows = $filter('orderBy')(rows, ORDERING);
			$scope.rows = rows;
		});

		$scope.microbiology_test_list = [];
		$scope.microbiology_test_lookup = {};

		for (var kix = 0; kix < option_names.length; kix++) {
			option_name = option_names[kix];
			$scope[option_name + '_list'] = [];
			$scope[option_name + '_synonyms'] = {};
			for (var j = 0; j < option_lists[option_name].length; j++) {
				$scope[option_name + '_list'].push(option_lists[option_name][j][0]);
				$scope[option_name + '_synonyms'][option_lists[option_name][j][0]] = option_lists[option_name][j][1];
				if (option_name.indexOf('micro_test') == 0) {
					$scope.microbiology_test_list.push(option_lists[option_name][j][0]);
					$scope.microbiology_test_lookup[option_lists[option_name][j][0]] = option_name;
				}
			};
		}

		$scope.microbiology_test_list.sort();
	})

	function getRowIxFromPatientId(patientId) {
		for (var rix = 0; rix < $scope.rows.length; rix++) {
			if ($scope.rows[rix].id == patientId) {
				return rix;
			}
		};
		throw 'Could not find row for patient ' + patient.id;
	};

	function getNumItems(rix, cix) {
		var column = $scope.columns[cix];
		return $scope.rows[rix][column.name].length;
	};

	function isSingleColumn(cix) {
		return $scope.columns[cix].single;
	};

	function getColumnName(cix) {
		return $scope.columns[cix].name;
	};

	function getCurrentColumnName(cix) {
		return getColumnName($scope.cix);
	};

	function getItem(rix, cix, iix) {
		var columnName = $scope.columns[cix].name;
		return $scope.rows[rix][columnName][iix];
	};

	function getCurrentItem() {
		return getItem($scope.rix, $scope.cix, $scope.iix);
	};

	function startEdit() {
		state = 'editing';
		$scope.editing = clone(getCurrentItem());
		$('#' + getCurrentColumnName() + '-modal').modal();
		$('#' + getCurrentColumnName() + '-modal').find('input,textarea').first().focus();
	};

	function startDelete() {
		if (isSingleColumn($scope.cix)) {
			// Cannot delete singleton
			return;
		}

		if (getNumItems($scope.rix, $scope.cix) == $scope.iix + 1) {
			// Cannot delete 'Add'
			return;
		}

		state = 'deleting';
		$('#delete-confirmation').modal();
		$('#delete-confirmation').find('.btn-primary').focus();
	};

	function clearModal(columnName) {
		$('#' + columnName + '-modal').modal('hide')

		// See https://github.com/openhealthcare/opal/issues/28
		document.activeElement.blur();
	};

	$scope.getCategory = function(testName) {
		if ($scope.microbiology_test_lookup !== undefined) {
			return $scope.microbiology_test_lookup[testName];
		}
	};

	$scope.getSynonymn = function(option, term) {
		var synonyms = $scope[option + '_synonyms'];
		if (synonyms !== undefined) {
			// The list of synonyms may not have loaded yet.
			// This would be a problem if we serve non-canonical
			// data and try an canonicalise before the synonyms are
			// loaded.  I think we shouldn't serve non-canonical
			// data but there might be a good reason to.
			return synonyms[term] || term;
		} else {
			return term;
		}
	};

	$scope.startAdd = function() {
		state = 'adding';
		$scope.editing = {location: {}, demographics: {}};
		$('#add-new-modal').modal();
		$('#add-new-modal').find('input,textarea').first().focus();
	};

	$scope.saveAdd = function() {
		state = 'normal';
		clearModal('add-new');
		$http.post('patient/', $scope.editing).success(function(patient) {
			for (var cix = 0; cix < $scope.columns.length; cix++) {
				if (isSingleColumn(cix)) {
					patient[getColumnName(cix)] = [patient[getColumnName(cix)]];
				} else {
					patient[getColumnName(cix)] = [{patient: patient.id}];
				}
			}
			$scope.rows.push(patient);
			$scope.rows = $filter('orderBy')($scope.rows, ORDERING);
			$scope.selectItem(getRowIxFromPatientId(patient.id), 0, 0);
		});
	};

	$scope.saveEdit = function() {
		var columnName = getCurrentColumnName();
		var patientId = $scope.rows[$scope.rix].id;
		var url = 'patient/' + patientId + '/' + columnName + '/';
		var items = $scope.rows[$scope.rix][columnName];

		state = 'normal';
		clearModal(columnName);

		items[$scope.iix] = clone($scope.editing);

		if (isSingleColumn($scope.cix)) {
			$http.put(url, $scope.editing);
			if (columnName == 'location') {
				$scope.rows = $filter('orderBy')($scope.rows, ORDERING);
				$scope.selectItem(getRowIxFromPatientId(patientId), $scope.cix, 0);
			}
		} else {
			if (typeof($scope.editing.id) == 'undefined') {
				// This is a new item
				$http.post(url, $scope.editing).success(function(item) {
					items[$scope.iix].id = item.id;
					items.push({patient: patientId});
				});
			} else {
				url = url + $scope.editing.id + '/';
				$http.put(url, $scope.editing);
			}
		}
	};

	$scope.saveEditAndAdd = function() {
		$scope.saveEdit();
		$scope.iix = getNumItems($scope.rix, $scope.cix) - 1;
		startEdit();
	}

	$scope.cancelAdd = function() {
		state = 'normal';
		clearModal('add-new');
	};

	$scope.cancelEdit = function() {
		state = 'normal';
		clearModal(getCurrentColumnName());
	};

	$scope.doDelete = function() {
		var patientId = $scope.rows[$scope.rix].id;
		var columnName = getCurrentColumnName();
		var items = $scope.rows[$scope.rix][columnName];
		var itemId = items[$scope.iix].id;
		var url = 'patient/' + patientId + '/' + columnName + '/' + itemId + '/';

		$http.delete(url);

		items.splice($scope.iix, 1);
		state = 'normal';
	};

	$scope.cancelDelete = function() {
		state = 'normal';
	};

	$scope.selectItem = function(rix, cix, iix) {
		$scope.rix = rix;
		$scope.cix = cix;
		$scope.iix = iix;
	}

	$scope.editItem = function(rix, cix, iix) {
		$scope.selectItem(rix, cix, iix);
		startEdit();
	}

	$scope.mouseEnter = function(rix, cix) {
		$scope.mouseRix = rix;
		$scope.mouseCix = cix;
	}

	$scope.mouseLeave = function() {
		$scope.mouseRix = -1;
		$scope.mouseCix = -1;
	}

	$scope.keypress = function(e) {
		switch (state) {
			case 'adding':
				handleKeypressAdd(e);
				break;
			case 'editing':
				handleKeypressEdit(e);
				break;
			case 'deleting':
				handleKeypressDelete(e);
				break;
			case 'normal':
				handleKeypressNormal(e);
				break;
		}
	}

	function handleKeypressAdd(e) {
		if (e.keyCode == 27) { // escape
			$scope.cancelAdd();
		}
	}


	function handleKeypressEdit(e) {
		if (e.keyCode == 27) { // escape
			$scope.cancelEdit();
		}
	}


	function handleKeypressDelete(e) {
		if (e.keyCode == 27) { // escape
			$scope.cancelDelete();
		}
	}


	function handleKeypressNormal(e) {
		switch (e.keyCode) {
			case 37: // left
			case 72: // h
				goLeft();
				break;
			case 39: // right
			case 76: // l
				goRight();
				break;
			case 38: // up
			case 75: // k
				goUp();
				break;
			case 40: // down
			case 74: // j
				goDown();
				break;
			case 13: // enter
				startEdit();
				break;
			case 8: // backspace
				e.preventDefault();
			case 46: // delete
				startDelete();
				break;
		}
	}

	function goLeft() {
		if ($scope.cix > 0) {
			$scope.cix--;
			$scope.iix = 0;
		}
	}

	function goRight() {
		if ($scope.cix < $scope.columns.length - 1) {
			$scope.cix++;
			$scope.iix = 0;
		}
	}

	function goUp() {
		if ($scope.iix > 0) {
			$scope.iix--;
		} else {
			if ($scope.rix > 0) {
				$scope.rix--;
				$scope.iix = getNumItems($scope.rix, $scope.cix) - 1;
			}
		}
	}

	function goDown() {
		if ($scope.iix < getNumItems($scope.rix, $scope.cix) - 1) {
			$scope.iix++;
		} else {
			if ($scope.rix < $scope.rows.length - 1) {
				$scope.rix++;
				$scope.iix = 0;
			}
		}
	}
});

app.value('$strapConfig', {
	datepicker: {
		format: 'yyyy-mm-dd',
		type: 'string'
	}
});
