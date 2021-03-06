var $debug = false;
var $showInstructions = true;

var $names = new Object(); // stores names for URIs based on dc:title, hxl:featureName, etc.

// add forward / backward buttons to the navigation
$('div.nav-hxlator').append('<span class="historynav pull-right"><a href="#" id="back" class="btn btn-mini disabled">&laquo; Back</a><a href="#" id="forward" class="btn btn-small disabled">Forward &raquo;</a></span>');

// click listener for the preview button:
$('#showPreview').click(function(){
	// replace the footer, in case the user has gone back after the final submission screen
	$('#hxlPreview > .modal-footer').html('<a href="#" class="btn" data-dismiss="modal">Close</a>');
	$('#hxlPreview').modal('show');	
});

// scroll to top of preview pane after loading it, so that the different tabs are visible
$('#hxlPreview').on('shown', function(){
    $('#hxlPreview > .modal-body').scrollTop(0); 
})

// ---------------------------------------------------
// The history/undo stuff
// ---------------------------------------------------

// History object – that's what we'll interact with and that's the object that will store our stack of mapping objects:
$hxlHistory = new Object();

// this is the stack of mapping objects (see MappingTemplate.json for an example)
$hxlHistory.states = new Array();
$hxlHistory.currentState = -1; // pointer to where we are in the array with the mapping currently in use

// adds a new state (aka. mapping xls->hxl) to the history stack:
$hxlHistory.pushState = function($inputMapping){
	// clone the mapping object before we push it to the array
	// otherwise, we would store references to the same mapping over and over again 
	var $clone = $.extend(true, {}, $inputMapping);
	
	// if the pointer to the currentState is *not* at the end of the states array,
	// the user has changed something after going back. In this case, we delete all 
	// states *after* the current one before we add the new state to the array:
	if($hxlHistory.currentState < $hxlHistory.states.length-1){
		$deleteFrom = $hxlHistory.currentState + 1 ;
		$deleteTo   = $hxlHistory.states.length - 1 ;
		$hxlHistory.states.remove($deleteFrom, $deleteTo);
	}
	
	$hxlHistory.states.push($clone);				
	// set pointer to the last element in the array, i.e., the one we just added:
	$hxlHistory.currentState = $hxlHistory.states.length-1;	
	
	$hxlHistory.processMapping();
}

// this is where the magic happens...
// Depending on the state of the mapping, this function decides what is shown to the user
// no arguments required, since the method will figure out automatically what the current state is
$hxlHistory.processMapping = function(){
	$('#loading').show();
	
	var $mapping = $hxlHistory.states[$hxlHistory.currentState];
	debug($mapping); 
	
	// if the user is coming back with an existing mapping, send her straight to the row selection:
	if($recycle){
		tagMappedCellsAndProps($mapping);
		enableRowSelection($initMapping);
	// otherwise: if the class has not been set yet, show the class pills:
	}else if(typeof $mapping.classuri == 'undefined'){
		selectClass($mapping);	
	}else if (typeof $mapping.samplerow == 'undefined') {
		selectRow($mapping);
	}else {
		mapProperty($mapping);
	}	

	$hxlHistory.checkLinks();
	generateRDF($mapping);			
}


// go one step back and revert to the last stored stage of the mapping
$hxlHistory.back = function(){
	$hxlHistory.currentState--;	
	$hxlHistory.processMapping();		
}

// if the user has gone back in the the mapping process, this function allows him to go forward again:
$hxlHistory.forward = function(){
	$hxlHistory.currentState++;	
	$hxlHistory.processMapping();		
}

// enables/disables the back/forward links depeding on the states array and currentState pointer
$hxlHistory.checkLinks = function(){
	
	//remove event listeners to avoid events being triggered multiple times:
	$('a#back').unbind();
	$('a#forward').unbind();
	
	// check back link
	if( $hxlHistory.currentState > 0 ){		
		// enable backward links:
		$('a#back').click(function() {
			$hxlHistory.back();
		});
		$('a#back').removeClass('disabled');
	}else{
		$('a#back').addClass('disabled');
	}
	
	// check forward link
	if( $hxlHistory.currentState < $hxlHistory.states.length -1 ){
		// enable backward links:
		$('a#forward').click(function() {
			$hxlHistory.forward();
		});
		$('a#forward').removeClass('disabled');
	}else{
		$('a#forward').addClass('disabled');
	}
	
}

// shows the class selection pills:
function selectClass($inputMapping){
	$('.hxlclass').unbind();
	$('.hxlclass-selectable').unbind();
	$('.hxlclass-expandable').unbind();
	
	// make sure we don't modify the original array entry:
	var $mapping = $.extend(true, {}, $inputMapping);
	$('.shortguide').load('classpills.php', function() {
		// hover handler to show class/property definitions in a popover
		$('.hxlclass').each(function() {
		    $(this).popover({
		        html: true,
		        placement: 'bottom'
		    });    
		}); 
		
		// click handler for the class buttons - step1
		$('.hxlclass-selectable').click(function(){
			$mapping.classuri = $(this).attr('classuri');
			$mapping.classsingular = $(this).attr('singular');
			$mapping.classplural = $(this).attr('plural');
			$hxlHistory.pushState($mapping); 
		});
		
		// click handler to expand the subclasses of a given HXL class:
		$('.hxlclass-expandable').click(function(){
			// 'un-highlight' all other LIs in this UL and hide the sub-class div
			
			$(this).parent().siblings('.solo').each(function(){
				$(this).removeClass('active');	
				$subclassesof = $(this).children().first().attr('classuri');
				$('div[subclassesof*="'+$subclassesof+'"]').addClass('hxl-hidden');
			});
			
			// highlight the clicked one:
			$(this).parent().addClass('active');
			
			// show the div containing the subclasses:
			$subclassesof = $(this).attr('classuri');
			$('div[subclassesof*="'+$subclassesof+'"]').removeClass('hxl-hidden');	
		});
		
		$('#loading').hide();
			
	});	
}

// pick the first row with data
function selectRow($inputMapping){
	// make sure we don't modify the original array entry:
	var $mapping = $.extend(true, {}, $inputMapping);

	// fixing a little UI flux:
	$('.popover').hide();
	
	// in case the method is called again after going back
	$('.hxlatorrow').removeClass('highlight'); 
	$('.hxlatorrow').unbind();
	$('.hxlatorcell').removeClass('selected');
	$('.hxlatorcell').unbind();
	
	$('.shortguide').slideUp(function(){		
		$('.shortguide').html('<p class="lead alert selectedclass instr" style="visibility: none"><strong>Step 2:</strong> Please click on the <strong>first</strong> row that contains <span class="label label-important" style="font-size: 1em">data</span> about a '+$mapping.classsingular+'/'+ $mapping.classplural +'.</p><p align="right"><i class="icon-hand-right"></i> Careful!  Don\'t pick the header row, but the first row containing actual data.</p>');	
		$('.shortguide').slideDown();
		$('.hxlatorrow').unbind();
		// put a click listener on the table rows:
		$('.hxlatorrow').click(function(){
			$(this).addClass('highlight');
			$('.hxlatorrow').unbind('click'); //only allow one click
			$mapping.samplerow = $(this).attr('data-rowid'); 
			$hxlHistory.pushState($mapping); 
		});
	});
	$('#loading').hide();	
}

// show properties for class and start mapping process
function mapProperty($inputMapping){
	$('#loading').show();	
	// make sure we don't modify the original array entry:
	var $mapping = $.extend(true, {}, $inputMapping);
	
	$('.hxlatorrow').unbind();
	$('.hxlatorcell').unbind();
	$('a#done').unbind();

	// in case we are coming back from the row selection:
	$('tr.hxlatorrow').removeClass('selected');
	$('tr.hxlatorrow').removeClass('lastselected');
	$('tr.hxlatorrow[data-rowid="' + $mapping.samplerow + '"]').addClass('highlight');


	// if there are already any cells selected, 'unselect' them first:
	// $('.hxlatorcell').removeClass('selected lastselected');
		
	//next step: show properties: 
	$('.shortguide').slideUp(function(){
		$.get('properties4class.php?classuri='+$mapping.classuri, function(data){
			
			var $hint = '';
			tagMappedCellsAndProps($mapping);

			// show a popup over the "preview HXL" button after the first mapped triple:
			if($('td.hxlatorcell.mapped').length == 1){
				$('#showPreview').tooltip('show');
			}else{
				$('#showPreview').tooltip('hide');
			}

			// if there are already any mappings (i.e., at least one tagged property button), show a different text:			
			if($('a.mapped').length > 0){
				$('.shortguide').html('<p class="lead alert instr">Keep doing this (select one or more cells, then select a property) until you have mapped all cells in the selected row. Keep in mind that a cell may address several properties, or a property may be addressed by several cells. Are you <a href="#" id="done" class="btn btn-info">done?</a></p><p align="right" id="togglep"><a href="#" id="toggle" class="btn btn-mini"><i class="icon-remove-sign"></i> Hide instructions</a></p>');

				$hint = '<p align="right"><i class="icon-hand-right"></i> Made a mistake? You can always go back using the buttons at the top right.</p>';

				$('a#done').click(function(){
					checkProperties($mapping);
				});

			}else{
				$('.shortguide').html('<p class="lead alert instr"><strong>Step 3:</strong> In HXL, any '+$mapping.classsingular+' can have the following properties. <br />Step 3a: Pick a cell or set of cells from the selected row that provide some information about one of the listed HXL properties.<br />Step 3b: Then click the property to which the data in this cell applies.<br /> <span class="muted">Note that a given cell (or set of cells) may address several properties.</span></p><p align="right" id="togglep"><a href="#" id="toggle" class="btn btn-mini"><i class="icon-remove-sign"></i> Hide instructions</a></p>');

				$hint = '<p align="right"><i class="icon-hand-right"></i> Use <code>shift</code> to select a range of cells.</p>';
			}
			
			//hide instructions if they were hidden before:
			if(!$showInstructions){
				$('p.instr').hide();
				$('#togglep').hide();				
			}
			// enable toggling of instructions:
			$('#toggle').click(function(){
				$('p.instr').hide('fast');
				$('#togglep').hide('fast');
				$showInstructions = false;
				
				$('a#btn-instr').show('fast');
				$('a#btn-instr').click(function(){
					$('p.instr').show('fast');
					$('#togglep').show('fast');
					$('a#btn-instr').hide('fast');
					$showInstructions = true;
				});

			});


			$('.shortguide').append(data);	

			tagMappedCellsAndProps($mapping);		


			$('.shortguide').append($hint).slideDown(function(){
				
				//explanation popovers for hxl properties:
				// placement function makes sure the popover stay within the page, via http://stackoverflow.com/questions/10238089/how-can-you-ensure-twitter-bootstrap-popover-windows-are-visible
				// if we need this placement function for other popovers, we might want to pull it out into a separate function			
				$('.hxlprop').popover({
			        html: true,
			        placement: function(tip, element) {
			            var $element, above, actualHeight, actualWidth, below, boundBottom, boundLeft, boundRight, boundTop, elementAbove, elementBelow, elementLeft, elementRight, isWithinBounds, left, pos, right;
			            isWithinBounds = function(elementPosition) {
			              return boundTop < elementPosition.top && boundLeft < elementPosition.left && boundRight > (elementPosition.left + actualWidth) && boundBottom > (elementPosition.top + actualHeight);
			            };
			            $element = $(element);
			            pos = $.extend({}, $element.offset(), {
			              width: element.offsetWidth,
			              height: element.offsetHeight
			            });
			            actualWidth = 283;
			            actualHeight = 117;
			            boundTop = $(document).scrollTop();
			            boundLeft = $(document).scrollLeft();
			            boundRight = boundLeft + $(window).width();
			            boundBottom = boundTop + $(window).height();
			            elementAbove = {
			              top: pos.top - actualHeight,
			              left: pos.left + pos.width / 2 - actualWidth / 2
			            };
			            elementBelow = {
			              top: pos.top + pos.height,
			              left: pos.left + pos.width / 2 - actualWidth / 2
			            };
			            elementLeft = {
			              top: pos.top + pos.height / 2 - actualHeight / 2,
			              left: pos.left - actualWidth
			            };
			            elementRight = {
			              top: pos.top + pos.height / 2 - actualHeight / 2,
			              left: pos.left + pos.width
			            };
			            above = isWithinBounds(elementAbove);
			            below = isWithinBounds(elementBelow);
			            left = isWithinBounds(elementLeft);
			            right = isWithinBounds(elementRight);
			            if (below) return "bottom";
			            else if (above) return "top";
			            else if (left) return "left";
			            else return "right";
			          }
			        });
			});			
			
			
			enableCellSelection($mapping);
			
			}).error(function() { 
				hxlError('Our server has some hiccups. We will look into that as soon as possible.');
		});
	});	
	
	$('#loading').hide();		
}

// let the user select rows in the spreadsheet for mapping
function enableRowSelection($inputMapping){
	// make sure we don't modify the original array entry:
	var $mapping = $.extend(true, {}, $inputMapping);

	if($recycle){ // in case the user is combing back with an existing translator:
		$('.shortguide').html('<p class="lead alert instr"><strong>Welcome back!</strong> Since you are re-using an existing translator, you can proceed to selecting the rows to HXLate. <a href="#" id="done-rows" class="btn btn-info">Done?</a></p><p align="right"><i class="icon-hand-right"></i> Use <code>shift</code> to select a range of rows.</p>');

	}else{
		$('.shortguide').html('<p class="lead alert instr"><strong>Step 4:</strong> Please select all rows now that you want to HXLate. Note that they must have the same structure as the row you have been working on so far. <a href="#" id="done-rows" class="btn btn-info">Done?</a></p><p align="right"><i class="icon-hand-right"></i> Use <code>shift</code> again to select a range of rows.</p>');	
	}
	

	$('tr.hxlatorrow').removeClass('highlight');

	// highlight all rows that have mapped cells in them:
	$('tr.hxlatorrow').each(function(){
		if($(this).find('.mapped').length > 0){
			$(this).addClass('selected');
		}
	});

	// also add lastselected to the first row, if only this one is selected, to enable the shift-click thingy:
	if($('tr.hxlatorrow.selected').length == 1){
		$('tr.hxlatorrow.selected').addClass('lastselected');
	}
	
	// ... aaand the click listener:
	$('#done-rows').click(function() {
	  	checkAllRows($mapping);
	});

	$('tr.hxlatorrow').click(function(e) {		
	  	$(this).toggleClass('selected');
	  	// if (a) the row has been added to the selection, (b) a row has been selected before, and 
	  	// (c) the shift key has been pressed, mark the whole range between those two as selected 
	  	if( $(this).hasClass('selected') ) {
	  		if ( $('.hxlatorrow').hasClass('lastselected') && e.shiftKey ){
		  		$('.lastselected').addClass('range');
		  		$(this).addClass('range');

				// iterate through and mark all rows between the two .range rows as selected:
				var $mark = false;
				$('tr.hxlatorrow').each(function() {
					// flip selection switch at the .range cells:
					if( $(this).hasClass('range') ){
						if($mark == true){
							$mark = false;
						} else {
							$mark = true;
						}
					}
					
					if ($mark == true){
						$(this).addClass('selected');
					}
				});
				
				// clean up
			  	$('.hxlatorrow').removeClass('range');
			 }
			 
			 //mark last selected cell to enable range selection via shift-click:
			 $('.hxlatorrow').removeClass('lastselected');
			 $(this).addClass('lastselected');
			 
	  	}
	  	
	  	// enable the property buttons and click listener if any cell is selected, disable if not:
	  	$('#done-rows').unbind();
	  	if ( $('tr.hxlatorrow').hasClass('selected') ){
	  		$('#done-rows').removeClass('disabled');
	  		$('#done-rows').click(function() {
	  			checkAllRows($mapping);
	  		});
	  	} else {
		  	$('#done-rows').addClass('disabled');
		  	$('#done-rows').unbind();
	  	}	  			  
	});	
}

// iterate all selected rows and check which @lookup values are still missing from the mapping
function checkAllRows($inputMapping){

	// make sure we don't modify the original array entry:
	var $mapping = $.extend(true, {}, $inputMapping);

	var $lookUpColumns = new Array();
	// first, iterate through the mapping to see at which colums we need to look for @lookup values
	$.each($mapping.datacontainers, function($c, $datacontainer){
		$.each($datacontainer, function($uri, $mappings){			
			$.each($mappings.triples, function($i, $triple){
					if($triple.object.indexOf('@lookup') == 0){					
						var $pusher = new Object;
						$pusher['column'] = $triple.object.substr(8);
						$pusher['predicate'] = $triple.predicate;
							
						if($.inArray($pusher, $lookUpColumns) == -1){ // only add if we don't have it yet
							$lookUpColumns.push($pusher);
						}
					}
			});
		});
	});

	
	var $lookUpTerms = new Array();

	// iterate rows and check for missing @lookup values:
	var $sample = $mapping.samplerow.split('-');
	var $samplerow= $sample[1];
	$('.hxlatorrow.selected').each(function($i, $tableRow){
	    var $rowid = $(this).attr('data-rowid').split('-');

		var $sheet = $rowid[0];
		var $row = $rowid[1];

		$.each($lookUpColumns, function($i, $lc){
			
			$column = $lc.column;			

			$columnsheet = $column.split('-')[0];
			$columncol = $column.split('-')[1];
			$columnrow = $column.split('-')[2];
			
			var $shiftedLookup = $sheet+'-'+$columncol+'-'+$row;
			var $val = $('td[data-cellid="'+$shiftedLookup+'"]').html();
			var $val = trim($val); // remove extra white space

			// check if the cell is in the sampleRow, or outside
			// if it is outside, do not "move" it to the current row (ignore it, it has already 
			// been added to the lookup table)
			// also, check if the value is already in the lookup table in the mapping 
			// and not yet in the lookup array we are currently filling
			if($val != '' && $columnrow == $samplerow && $mapping.lookup[$val] == undefined){
				var $looki = new Object;
				$looki['term'] = $val;
				$looki['predicate'] = $lc.predicate;
				$looki['cell'] = $shiftedLookup;
				
				addLookupTerm($looki, $lookUpTerms);			
			}
		});		

	});

	// if there are any terms to look up, display the lookup modal one more time:
	if($lookUpTerms.length > 0){
		lookUpModal($mapping, $lookUpTerms, true);
		$('#mappingModal').modal('show');	
	}else{
		//if there's nothing left to look up, we can initiate the final translation:
		generateFinalRDF($mapping); 
	}
}

// adds a $term object, consisting of ['term'], ['predicate'], and ['cell'] to $lookUpTerms
// if there is no $term with the same ['term'] and ['predicate'] yet; if it is already there, 
// only add the ['cell'] to this object's cells
function addLookupTerm($term, $lookUpTerms){
	
	var $addNewTerm = true;

	$.each($lookUpTerms, function($i, $looki){		
		if($looki['term'] == $term['term'] && $looki['predicate'] == $term['predicate']){
			if($.inArray($term['cell'], $looki['cells']) == -1){
				$looki['cells'].push($term['cell']);
			}
			$addNewTerm = false;
		}
	});

	// term is not there yet, add it:
	if($addNewTerm){
		var $thisTerm = new Object();
		$thisTerm['term'] = $term['term'];
		$thisTerm['predicate'] = $term['predicate'];
		$thisTerm['cells'] = new Array();
		$thisTerm['cells'].push($term['cell']);

		$lookUpTerms.push($thisTerm);	
	}	
	return $lookUpTerms;
}

// check if all properties have been mapped, show those that have not been mapped to the user in a modal:
function checkProperties($inputMapping){

	// make sure we don't modify the original array entry:
	var $mapping = $.extend(true, {}, $inputMapping);

	$('a#selectRows').unbind();

	var $missingProps = '';
	var $numProps = 0;
	$('a.hxlprop').each(function(){
		if(!$(this).hasClass('mapped')){
			$missingProps += '<span class="label label-info missing-prop" style>'+$(this).html()+'</span> ';
			$numProps ++;
		}
	});

	// show the modal if there are any missing properties:
	if($missingProps != ''){
		$('#mappingModal > .modal-header > h3').html($numProps+' properties not mapped');
		$('#mappingModal > .modal-body').html('<p>The following properties have not been mapped yet:</p><p>'+$missingProps+'<p>If you do not have any information on these properties, go ahead and select the rows of this spreadsheet that you want to HXLate. If you do have information about any of these properties (either in the spreadsheet, or elsewhere), please go back to the <em>Build Translator</em> page and fill these in.</p>');
		$('#mappingModal > .modal-footer').html('<a href="#" id="selectRows" class="btn">Select rows</a><a href="#" class="btn" data-dismiss="modal">Go back</a>');
		$('#mappingModal').modal('show');

		$('a#selectRows').click(function(){
			$('#mappingModal').modal('hide');	
			enableRowSelection($mapping);	
		});

	}else{
		enableRowSelection($mapping);
	}
}

function enableCellSelection($mapping){

	// dis- or enable the buttons on startup, depending on whether a cell is selected or not:
	togglePropertyButtonsDisabled($mapping);

	// handle selection on the highlighted table row
	$('tr.highlight > td.hxlatorcell').click(function(e) {		
	  	$(this).toggleClass('selected');
	  	// if (a) the cell has been added to the selection, (b) a cell has been selected before, and 
	  	// (c) the shift key has been pressed, mark the whole range between those two as selected 
	  	if( $(this).hasClass('selected') ) {
	  		if ( $('.hxlatorcell').hasClass('lastselected') && e.shiftKey ){
		  		$('.lastselected').addClass('range');
		  		$(this).addClass('range');

				// iterate through that row and mark all cells between the two .range cells as selected:
				var $mark = false;
				$('tr.highlight > td.hxlatorcell').each(function() {
					// flip selection switch at the .range cells:
					if( $(this).hasClass('range') ){
						if($mark == true){
							$mark = false;
						} else {
							$mark = true;
						}
					}
					
					if ($mark == true){
						$(this).addClass('selected');
					}
				});
				
				// clean up
			  	$('.hxlatorcell').removeClass('range');
			 }
			 
			 //mark last selected cell to enable range selection via shift-click:
			 $('.hxlatorcell').removeClass('lastselected');
			 $(this).addClass('lastselected');
			 
	  	}
	  	
	  	// enable the property buttons and click listener if any cell is selected, disable if not:
	 	togglePropertyButtonsDisabled($mapping);

	});
}

// enable the property buttons and click listener if any cell is selected, disable if not:	 	
function togglePropertyButtonsDisabled($mapping){
	if ( $('tr.highlight > td.hxlatorcell').hasClass('selected') ){
  		$('.hxlprop').removeClass('disabled');
  		$('.hxlprop').click(function() {
  			mappingModal($mapping, $(this).attr('data-original-title'), $(this).attr('data-hxl-uri'), $(this).attr('data-hxl-propertytype'), $(this).attr('data-hxl-range'), $(this).attr('data-hxl-range-name') );	
  		});
  	} else {
	  	$('.hxlprop').addClass('disabled');
	  	$('.hxlprop').unbind();
  	}
}

// shows and fills the mapping modal
function mappingModal($inputMapping, $propName, $propURI, $propType, $propRange, $propRangeName){
	
	var $nc = $('td.selected').length;

	if($nc == 1){
		var $numCells = 'one cell';
	}else{
		var $numCells = $nc+' cells';
	}
		
	$('#mappingModal > .modal-header > h3').html('<img src="img/loader.gif" id="modal-loading" class="pull-right" />Mapping '+$numCells+' to the <em>'+$propName+'</em> property');
	
	$('#mappingModal > .modal-footer').html('<div class="metadata-panel"><h3>Metadata</h3><p>Adjust the metadata for the information above if it differs from the metadata provided during upload.</p><div class="control-group"><label class="control-label" for="report_category" ><i class="icon-calendar"></i> Data valid on:</label><div class="controls"><input id="hxl:validOn" name="hxl:validOn" class="span3 metadata" data-date="'+$validOn+'" data-date-format="yyyy-mm-dd" size="16" type="text" value="'+$validOn+'" /></span></div></div></div><div class="submit-panel"><p><i class="icon-hand-right"></i> Peek at your spreadsheet by pressing <code>ALT-K</code>.</p><a href="#" id="storeMapping" class="btn btn-primary">Store mapping</a><a href="#" class="btn" data-dismiss="modal">Cancel</a></div>');
	
	$('input[name="hxl:validOn"]').datepicker();

	if($propType == 'http://www.w3.org/2002/07/owl#DataProperty'){
		$('#mappingModal > .modal-body').html('<p>You can either <a href="#" class="btn" id="mapCellValues">use the values in the selected cell(s)</a> or <a href="#" class="btn" id="mapDifferentValues">use a different value</a></p><div id="value-input" style="display: none"></div>');
		
		$('#mapCellValues').click(function(){
			$(this).addClass('btn-info');
			$('#mapDifferentValues').removeClass('btn-info');
			mapCellValues($inputMapping, $propName, $propURI, $propType, $propRange);
		});
		
		$('#mapDifferentValues').click(function(){
			$(this).addClass('btn-info');
			$('#mapCellValues').removeClass('btn-info');
			mapDifferentValues($inputMapping, $propName, $propURI, $propType, $propRange);
		});
		
	} else if ($propType == 'http://www.w3.org/2002/07/owl#ObjectProperty' || $propType == 'http://www.w3.org/2002/07/owl#TransitiveProperty'){
		$('#mappingModal > .modal-body').html('<p>This property should refer to a <a href="'+$propRange+'" target="blank">'+$propRangeName+'</a> from one of our reference lists.</p><div id="value-input" style="display: none"></div>');
		
		mapWithURILookup($inputMapping, $propName, $propURI, $propType, $propRange, $propRangeName);			
		
	} else { // Something's going wrong...
		$('#mappingModal > .modal-body').html('<p>We can\'t handle the property type '+$propType+'</p>');
	}
		
	$('#mappingModal').modal('show');
}




// generates the modal contents to map object properties (with URI lookup)
function mapWithURILookup($inputMapping, $propName, $propURI, $propType, $propRange, $propRangeName){
	// make sure we don't modify the original array entry:
	var $mapping = $.extend(true, {}, $inputMapping);
	
	$('#value-input').slideUp(function(){
		$('#value-input').html('');
		$('.selected').each(function(){
			$('#value-input').append('<hr /><em>'+$propName+'</em> for cell <code>'+$(this).attr('data-cellid')+'</code><br><input type="text" class="value-input" placeholder="Start typing to search reference list" id="valuefor-'+$(this).attr('data-cellid')+'" data-value-subject="'+$(this).attr('data-cellid')+'" data-cellid="'+$(this).attr('data-cellid')+'"> or <a href="#" class="btn btn-small cell-input" data-cellid="'+$(this).attr('data-cellid')+'">map from spread sheet</a><br /><small data-cellid="'+$(this).attr('data-cellid')+'" class="uri valuefor-'+$(this).attr('data-cellid')+'"></small>');	

			// show 'copy' button if more than one field is selected:
			if ( $('.selected').length > 1){
				$('#value-input').append('<br /><a href="#" class="btn btn-small disabled adoptforall valuefor-'+$(this).attr('data-cellid')+'" data-cellid="'+$(this).attr('data-cellid')+'" style="margin-top 10px">Adopt this value for all selected cells</a>');
			}
			
		});
		
		// copying values over to all input fields:
		if ( $('.selected').length > 1){
			$('.adoptforall').click(function(){

				var $selecta = '.value-input[data-cellid='+$(this).attr('data-cellid')+']';

				var $copyVal      = $($selecta).val();
				var $copyURI      = $($selecta).attr('data-value-object');
				var $copyFunction = $($selecta).attr('data-function');
				var $hint         = $('small[data-cellid='+$(this).attr('data-cellid')+']').html();
				
				$('.value-input').each(function(){
					$(this).val($copyVal);
					$(this).attr('data-value-object', $copyURI);
					$(this).attr('data-function', $copyFunction);
				});
					
				$('.uri').each(function(){
					$(this).html($hint);
				});		  	
			});	
		}
			


		// enable value selection from spreadsheet
		$('.cell-input').click(function(){			
			$('.hxlatorcell').unbind();
			var $subjectcell = $(this).attr('data-cellid');

			// hide the modal and allow the user to select the cell:
			$('#mappingModal').modal('hide');
			$('.shortguide').slideUp();
			$('.shortguide').after('<div class="container cell-instructions"><div class="alert alert-info">Please click the cell that contains the value for the <em>'+$propName+'</em> property of cell <code>'+$(this).attr('data-cellid')+'</code>. We will then take you back to the mapping window.</div></div>');
			
			var $target = $(this).attr('data-cellid');
			
			$('.hxlatorcell').click(function(){
				
				// the input field to write into:
				var $selecta = 'input[data-value-subject="'+$subjectcell+'"]';

				$($selecta).val($(this).html()+' (via cell '+$(this).attr('data-cellid')+')');
				$('small[data-cellid="'+$subjectcell+'"]').html('We will ask you to select the URI for this term in the next step.');
				// add the @lookup tag to the value to indicate that we'll need to look up the values for these at the end
				$($selecta).attr('data-value-object', $(this).attr('data-cellid'));
				$($selecta).attr('data-function', '@lookup');
				
				$('.adoptforall[data-cellid="'+$subjectcell+'"]').removeClass('disabled');
				
				$('#mappingModal').modal('show');
				$('.shortguide').slideDown();
				$('.cell-instructions').remove();
				// unbind all listeners, then bind the select listener for the cells again ('mark orange')
				$('.hxlatorcell').unbind();				
				enableCellSelection($mapping);
			});
			
		});
		
		
		// add autocomplete to the input fields:
		$('.value-input').autocomplete({
				source: function( request, response ) {
					
					// select the query based on the range of this property:
					var $query = '';
				
					if($propRange == 'http://hxl.humanitarianresponse.info/ns/#AdminUnit' || $propRange == 'http://hxl.humanitarianresponse.info/ns/#APL' ||$propRange == 'http://hxl.humanitarianresponse.info/ns/#Country' || $propRange == 'http://www.opengis.net/geosparql#Feature'){
				
						$query = 'prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> prefix hxl: <http://hxl.humanitarianresponse.info/ns/#> prefix skos: <http://www.w3.org/2004/02/skos/core#> SELECT * WHERE { ?value rdf:type/rdfs:subClassOf* <'+$propRange+'>; a ?type ; hxl:featureName ?label ; hxl:atLocation* ?location ; hxl:pcode ?pcode . ?type skos:prefLabel ?typeLabel . ?location a hxl:Country ; hxl:featureName ?country .   FILTER regex(?label, "'+request.term+'", "i") } ORDER BY ?label';

					}else if ($propRange == 'http://hxl.humanitarianresponse.info/ns/#AgeGroup'){
						
						$query = 'PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX hxl: <http://hxl.humanitarianresponse.info/ns/#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT DISTINCT ?set ?setTitle ?group ?groupTitle WHERE {  ?set a hxl:AgeGroupSet ; hxl:title ?setTitle ; ?foo ?group . ?group a hxl:AgeGroup ; hxl:title ?groupTitle ; hxl:fromAge ?fromAge . FILTER regex(?groupTitle, "'+request.term+'", "i")} ORDER BY ?fromAge';
						
					}else if ($propRange == 'http://hxl.humanitarianresponse.info/ns/#AdminUnitLevel'){
						
						$query = 'prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> prefix hxl: <http://hxl.humanitarianresponse.info/ns/#> SELECT * WHERE { ?value rdf:type/rdfs:subClassOf* <'+$propRange+'> . ?value hxl:adminUnitLevelTitle ?label . FILTER regex(?label, "'+request.term+'", "i") } ORDER BY ?label';
						
					}else if ($propRange == 'http://hxl.humanitarianresponse.info/ns/#HXLer'){

						$query = 'prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> prefix hxl: <http://hxl.humanitarianresponse.info/ns/#> SELECT * WHERE { ?value rdf:type/rdfs:subClassOf* <'+$propRange+'> . ?value <http://xmlns.com/foaf/0.1/name> ?label . FILTER regex(?label, "'+request.term+'", "i") } ORDER BY ?label';		
										
					}else if ($propRange == 'http://hxl.humanitarianresponse.info/ns/#Emergency'){

						$query = 'prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> prefix hxl: <http://hxl.humanitarianresponse.info/ns/#> SELECT * WHERE { ?value rdf:type/rdfs:subClassOf* <'+$propRange+'> . ?value hxl:commonTitle ?label . FILTER regex(?label, "'+request.term+'", "i") } ORDER BY ?label';								
					}else if ($propRange == 'http://hxl.humanitarianresponse.info/ns/#Organisation'){
						
						$query = 'prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> prefix hxl: <http://hxl.humanitarianresponse.info/ns/#> SELECT * WHERE { ?value rdf:type/rdfs:subClassOf* <'+$propRange+'> ; hxl:abbreviation ?label . FILTER regex(?label, "'+request.term+'", "i") } ORDER BY ?label';	

					} else if ($propRange == 'http://www.w3.org/2000/01/rdf-schema#Class') {
						$query = 'prefix skos: <http://www.w3.org/2004/02/skos/core#> prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> prefix hxl: <http://hxl.humanitarianresponse.info/ns/#> SELECT * WHERE { ?value rdf:type/rdfs:subClassOf* <'+$propRange+'> . ?value skos:prefLabel ?label . FILTER regex(?label, "'+request.term+'", "i") } ORDER BY ?label';    
					} else {
						$query = 'prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> prefix hxl: <http://hxl.humanitarianresponse.info/ns/#> SELECT * WHERE { ?value rdf:type/rdfs:subClassOf* <'+$propRange+'> . ?value hxl:title ?label . FILTER regex(?label, "'+request.term+'", "i") } ORDER BY ?label';    
					}
					
					
					
					$('#modal-loading').show();
					$.ajax({
						url: 'http://hxl.humanitarianresponse.info/sparql',
						headers: {
							Accept: 'application/sparql-results+json'
						},
						data: { 
							query: $query 
						},							
						success: function( data ) {

							if(!data.results.bindings.length){ // no results
								response([{
									value: 'No matching results found.',
									uri: '<>'
								}]);
							}else{				
								response( $.map( data.results.bindings, function( result ) {
									
									// special handling of Features to show the country they are in:
									if($propRange == 'http://hxl.humanitarianresponse.info/ns/#AdminUnit' || $propRange == 'http://hxl.humanitarianresponse.info/ns/#APL' || $propRange == 'http://hxl.humanitarianresponse.info/ns/#Country' || $propRange == 'http://www.opengis.net/geosparql#Feature'){
										return {
											value: result.label.value+ ' ('+result.typeLabel.value+' in '+result.country.value+', P-Code: '+result.pcode.value+')',
											uri: result.value.value
										}
									// special handling for age groups to include the age group set title:
									}else if($propRange == 'http://hxl.humanitarianresponse.info/ns/#AgeGroup'){
										return {
											value: result.groupTitle.value+ ' ('+result.setTitle.value+')',
											uri: result.group.value
										}
									}else{
										return {
											value: result.label.value,
											uri: result.value.value
										}
									}
									
								}));
							}
							$('#modal-loading').hide();
						},
						error: function($jqXHR, $textStatus, $errorThrown){
							console.error($textStatus);
						}
					});
				},
				minLength: 1,
				select: function( event, ui ) {
					// show the URI to the user 
					$('small.'+$(this).attr('id')).html(('URI for this '+$propRangeName+': <a href="'+ui.item.uri+'" target="_blank">'+ui.item.uri+'</a>'));
					// ...and store it in a data attribute of the input field
					$(this).attr('data-value-object', ui.item.uri);
					
					$('a.'+$(this).attr('id')).removeClass('disabled');
				}
			});
		
		$('#value-input').slideDown();
		addPropertyMappings($mapping, $propURI);
		
	});
	
}


// generates the modal contents to map data properties to values other than the cell contents
function mapDifferentValues($inputMapping, $propName, $propURI, $propType, $propRange){

	// make sure we don't modify the original array entry:
	var $mapping = $.extend(true, {}, $inputMapping);
	
	$('#value-input').slideUp(function(){
		// TODO: show value(s) in input field(s) if already stored in mapping
		// (e.g. after going back)
		$('#value-input').html('');
		$('.selected').each(function(){
			$('#value-input').append('<hr /><em>'+$propName+'</em> for cell <code>'+$(this).attr('data-cellid')+'</code><br><input type="text" class="value-input" placeholder="Enter value here" id="valuefor-'+$(this).attr('data-cellid')+'" data-value-subject="'+$(this).attr('data-cellid')+'"> or <a href="#" class="btn btn-small cell-input" data-cellid="'+$(this).attr('data-cellid')+'">select from spread sheet</a>');	

			//show 'copy' button if there is more than one cell selected
			if($('.selected').length > 1){
			 	$('#value-input').append('<br /><a href="#" class="btn btn-small disabled adoptforall" data-cellid="'+$(this).attr('data-cellid')+'">Adopt this value for all selected cells</a>');
			 
			 	var $cell = $(this).attr('data-cellid');
			 	var $selecta = 'input[data-value-subject="'+ $cell +'"]';

				$($selecta).keyup(function(){
					var $btnselecta = $('a.adoptforall[data-cellid="'+$cell+'"]');
					if($(this).val() == ''){
				  		$($btnselecta).addClass('disabled');
				  	}else{
				  		$($btnselecta).removeClass('disabled');
				  	}
			  	});

			  	$('.adoptforall').click(function(){
					// copy value to other input fields

					var $copyVal = $($selecta).val();
					var $copyObj = $($selecta).attr('data-value-object');

					$('.value-input').each(function(){
						$(this).val($copyVal);
						$(this).attr('data-value-object', $copyObj);
					})			  	
				});	
			}
		});			
		
		// enable value selection from spreadsheet
		$('.cell-input').click(function(){			
			$('.hxlatorcell').unbind();
			var $subjectcell = $(this).attr('data-cellid');

			// hide the modal and allow the user to select the cell:
			$('#mappingModal').modal('hide');
			$('.shortguide').slideUp();
			$('.shortguide').after('<div class="container cell-instructions"><div class="alert alert-info">Please click the cell that contains the value for the <em>'+$propName+'</em> property of cell <code>'+$(this).attr('data-cellid')+'</code>. We will then take you back to the mapping window.</div></div>');
			
			var $target = $(this).attr('data-cellid');
			
			$('.hxlatorcell').click(function(){
				
				// the input field to write into:
				var $selecta = 'input[data-value-subject="'+$subjectcell+'"]';

				$($selecta).val($(this).html()+' (via cell '+$(this).attr('data-cellid')+')');
				$($selecta).attr('data-value-object', $(this).attr('data-cellid'));
				$($selecta).trigger('keyup');
				
				$('#mappingModal').modal('show');
				$('.shortguide').slideDown();
				$('.cell-instructions').remove();
				// unbind all listeners, then bind the select listener for the cells again ('mark orange')
				$('.hxlatorcell').unbind();				
				enableCellSelection($mapping);
			});
			
		});
		
		
		$('#value-input').slideDown();
		addPropertyMappings($mapping, $propURI);		
				
	});	
	
}


// automatically generates triple objects for the selected property from the selected cells
function mapCellValues($inputMapping, $propName, $propURI, $propType, $propRange){
	
	// make sure we don't modify the original array entry:
	var $mapping = $.extend(true, {}, $inputMapping);
	
	$('#value-input').slideUp(function(){
		$('#value-input').html('');
		
		$('.selected').each(function(){
			$('#value-input').append('<hr /><p><em>'+$propName+'</em> for cell <code>'+$(this).attr('data-cellid')+'</code><br><input type="text" class="value-input" readonly value="'+$(this).html()+' (via cell '+$(this).attr('data-cellid')+')" data-value-subject="'+$(this).attr('data-cellid')+'" data-value-object="'+$(this).attr('data-cellid')+'" id="valuefor-'+$(this).attr('data-cellid')+'">');	
		});
		
		$('#value-input').slideDown();
		addPropertyMappings($mapping, $propURI);				
	});	
}

// adds a click listener to the "store mapping" button in the mapping modal,
// adds the data properties shown in the modal to the mapping
// and pushes the mapping to the mappings stack
function addPropertyMappings($mapping, $propURI){

	$('#storeMapping').unbind(); // remove any old listeners
	$('#storeMapping').click(function(){
		
		// make sure the ALT-K handler is removed when the modal is closed
		$(document).unbind('keydown', hideHandler);

		// store all @lookup values that are not in the lookup table yet in an array:
		var $nolook = new Array();

		// first find the right datacontainer that these triples go into.
		// check the metadata we have, iterate through the datacontainers, 
		// and pick the first one that has 100% overlap

		var indexOfMatchingContainer = -1;

		$.each($mapping.datacontainers, function($index, $container){
			var $mismatch = false;
		
			$('input.metadata').each(function(){
				
				var $predicate = $(this).attr('id');
				var $object = $(this).val();
				
				$.each($container, function($uri, $uris){
					$.each($uris, function($i, $triples){
						// check for mismatch in the values of the metadata properties:
						$.each($triples, function($i, $triple){
							if($triple['predicate'] == $predicate && $triple['object'] != $object){
								$mismatch = true;								
							}							
						});
					});
				});
			});

			if(!$mismatch){
				indexOfMatchingContainer = $index;
			}
		});
			

		// if there is no datacontainer with this combination of metadata, add a new one.
		// copy all metadata from the first data container over (which has all the standard metadata from the upload 
		// page) and replace those with our modified metadata

		if(indexOfMatchingContainer == -1){
			var stamp = new Date().getTime();
			var newContainerURI = '<http://hxl.humanitarianresponse.info/data/datacontainers/'+stamp+'>';

			$.each($mapping.datacontainers[0], function($uri, $triples){
				if($uri.indexOf('<http://hxl.humanitarianresponse.info/data/datacontainers') == 0){
					var newContainerMetadata = $.extend(true, {}, $triples);
					
					// replace all metadata values that have changed:
					$('input.metadata').each(function(){
				
						var $predicate = $(this).attr('id');
						var $object = $(this).val();

						$.each(newContainerMetadata.triples, function($i, $triple){
							if($triple.predicate == $predicate){
								$triple.object = $object;
							}
						});

					});
					

					var newContainer = new Object();
					newContainer[newContainerURI] = newContainerMetadata;
					// add to mapping
					$mapping.datacontainers.push(newContainer);
				}
			});	

			indexOfMatchingContainer = $mapping.datacontainers.length-1;					
		}

		// console.log($mapping);
		
		// iterate through all input fields 
		$('.value-input').each(function(){

			if($(this).attr('data-value-object') != undefined || $(this).val() != ''){ // ignore fields with no input
				var $uri = '@uri '+$(this).attr('data-value-subject');
				
				// if there are no mappings for this URI yet, add this node to the JSON tree:
				if($mapping.datacontainers[indexOfMatchingContainer][$uri] == undefined){
				   $mapping.datacontainers[indexOfMatchingContainer][$uri] = new Object();
				   $mapping.datacontainers[indexOfMatchingContainer][$uri].triples = new Array();						
				}
				
				// add the triple: 
				var $index =  $mapping.datacontainers[indexOfMatchingContainer][$uri].triples.length;

				// check if this predicate is already mapped: if so, replace the old value
				// TODO: this basically assumes that all our properties have a max cardinality of 1; 
				// we might have to come up with something based on the vocabulary once we have cardinalities in there.
				$.each($mapping.datacontainers[indexOfMatchingContainer][$uri].triples, function($i, $triple){
					if($triple['predicate'] == $propURI){
						$index = $i;
					}
				});

						
				$mapping.datacontainers[indexOfMatchingContainer][$uri].triples[$index] = new Object();
				$mapping.datacontainers[indexOfMatchingContainer][$uri].triples[$index]['predicate'] = $propURI;
				
				// store a mapping depending on input field metadata
				if($(this).attr('data-value-object') == undefined){
					
					// data property with direct input
					$mapping.datacontainers[indexOfMatchingContainer][$uri].triples[$index]['object'] = $(this).val();
					
				} else if($(this).attr('data-value-object').indexOf('http') == 0){
				
					// object property that has already been looked up
					$mapping.datacontainers[indexOfMatchingContainer][$uri].triples[$index]['object'] = '<'+$(this).attr('data-value-object')+'>';
				
				} else if($(this).attr('data-function') == '@lookup'){
					
					// object property with lookup at the end of the mapping process
					$mapping.datacontainers[indexOfMatchingContainer][$uri].triples[$index]["object"] = '@lookup '+$(this).attr('data-value-object');

					// check if the term to look up is already in our lookup dictionary; 
					// if not, we save the term in an array and send the user to (yet anther) mapping // page where s/he can assign URIs to the terms not in the dictionary so far
					// check if we already have the term in our lookup "dictionary" (or already in the $nolook array)
					var $lookupterm = getCellContents($(this).attr('data-value-object'));
					$lookupterm = trim($lookupterm);
					if($lookupterm != '' && $mapping.lookup[$lookupterm] == undefined){
						var $looki = new Object();
						$looki['term'] = $lookupterm;
						$looki['predicate'] = $propURI;
						$looki['cell'] = $(this).attr('data-value-object');

						addLookupTerm($looki, $nolook);					
					} 

				} else {
					
					// data property that takes the value from the spreadsheet
					$mapping.datacontainers[indexOfMatchingContainer][$uri].triples[$index]["object"] = '@value '+$(this).attr('data-value-object');
					
				}
			}
										
		});
		
		
		// check the $nolook array: if it's empty, we are good and we can simply store the mapping.
		// if it does contain any terms, we'll send the user over to a new modal, where s/he can look them up:
		if($nolook.length == 0){
			// push mapping to mapping stack:
			$hxlHistory.pushState($mapping);
			// close modal:
			$('#mappingModal').modal('hide');
		} else {
			// send to lookup modal
			lookUpModal($mapping, $nolook, false);
		}
		
	});
}

// Generates a modal that allows the user to look up URIs for all terms in $missing. 
// Set $final to true if this is the final lookup before the RDF generation!
function lookUpModal($inputMapping, $missing, $final){

	// make sure we don't modify the original array entry:
	var $mapping = $.extend(true, {}, $inputMapping);
	

	// hide and replace the old modal contents
	$('#mappingModal > .modal-header > h3').slideUp(function(){
		var $no = $missing.length;
		if($no == 1)
			$no = "one term";
		else
			$no += " terms";

		$(this).html('<img src="img/loader.gif" id="modal-loading" class="pull-right" />URI lookup for '+$no);
		$('#modal-loading').show();
		$(this).slideDown();
	});
	
	
	$('#mappingModal > .modal-footer').slideUp(function(){
		$(this).html('<p><i class="icon-hand-right"></i> Peek at your spreadsheet by pressing <code>ALT-K</code>.</p><a href="#" id="storeLookUps" class="btn btn-primary">Save and Continue</a><a href="#" class="btn" data-dismiss="modal">Cancel</a>');		
		$(this).slideDown();
	});
	
	
	$('#mappingModal > .modal-body').slideUp(function(){
		$(this).html('<p>Please select one URI from our reference lists for each value that you have selected in your spreadsheet. HXLator tries to propose URIs that match the terms; if that does not work, you can also look them up yourself.</p><hr />');
		$(this).append('<div class="row"><div class="span2"><h3>Term</h3></div><div class="span3"><h3>URI</h3></div></div><hr />');

		$.each($missing, function($i, $miss){

			var $cellInfo = 'From cell(s):<br /> ';
			$.each($miss.cells, function($i, $cell){
				$cellInfo += '<code>'+$cell+'</code><br />';
			});
			
			$('#mappingModal > .modal-body').append('<div class="row"><div class="span2"><h3><code>'+$miss.term+'</code></h3><p>'+$cellInfo+'<p></div><div class="span3" for-term="'+$miss.term+'"></div></div><hr />');


			var $query = 'prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> prefix skos: <http://www.w3.org/2004/02/skos/core#> prefix hxl: <http://hxl.humanitarianresponse.info/ns/#> prefix dct: <http://purl.org/dc/terms/>  prefix foaf: <http://xmlns.com/foaf/0.1/> prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT DISTINCT ?uri ?label ?typelabel ?pcode ?loc WHERE {'+$miss.predicate+' rdfs:range ?range . ?uri rdf:type/rdfs:subClassOf* ?range; a ?type . { ?type skos:prefLabel ?typelabel } UNION { ?type rdfs:label ?typelabel } { ?uri hxl:featureRefName ?label } UNION { ?uri hxl:commonTitle ?label } UNION { ?uri dct:title ?label } UNION { ?uri foaf:name ?label } UNION { ?uri hxl:abbreviation ?label } UNION { ?uri hxl:adminUnitLevelTitle ?label } UNION { ?uri hxl:orgName ?label } UNION { ?uri hxl:title ?label } OPTIONAL {?uri hxl:atLocation* ?location ; hxl:pcode ?pcode . ?location hxl:featureName ?loc; a hxl:Country . } FILTER regex(?label, "'+$miss.term+'", "i") } ORDER BY ?label';

			$.ajax({
				url: 'http://hxl.humanitarianresponse.info/sparql',
				headers: {
					Accept: 'application/sparql-results+json'
				},
				data: { 
					query: $query 
				},							
				success: function( data ) {

					$.each(data.results.bindings, function(i, result) {
						var placeInfo = '';
						if(result.pcode != undefined && result.loc != undefined){
							placeInfo = ' in ' + result.loc.value + '; P-Code '+result.pcode.value;
						}
						$('div[for-term="'+$miss.term+'"]').append('<label class="radio"><input type="radio" name="'+$miss.term+'" class="rdio" value="'+result.uri.value+'">'+result.label.value+' (' + result.typelabel.value + placeInfo + ')<br /><small><a href="'+result.uri.value+'" target="_blank">'+result.uri.value+'</a></small></label>');
					});

					// if there are no results:
					if(data.results.bindings.length == 0){
						$('div[for-term="'+$miss.term+'"]').append('<p missing-term="'+$miss.term+'">No suggestion found for this term, you can try to find a URI yourself:</p>');
						$('div[for-term="'+$miss.term+'"]').append('<input type="text" class="uri-search" placeholder="Start typing to search reference list" for-term="'+$miss.term+'" />');
					}else{
						$('div[for-term="'+$miss.term+'"]').append('<p missing-term="'+$miss.term+'">If the correct URI is not among the suggestions, you can try to find it yourself:</p>');
						$('div[for-term="'+$miss.term+'"]').append('<label class="radio"><input type="radio" name="'+$miss.term+'" class="rdio" value="@userlookup"><input type="text" readonly class="uri-search" placeholder="Start typing to search reference list" for-term="'+$miss.term+'" /></label>');
					}

					// make the radio buttons next to the input boxes enable the corresponding text input box:
					$('input[name="'+$miss.term+'"]').change(function(){
						
						if($('input[name="'+$miss.term+'"]:checked').val() == '@userlookup'){
							// if the radio button next to the text box is clicked, toggle readonly:
							$('input[for-term="'+$miss.term+'"]').attr('readonly', false);
						}else{
							$('input[for-term="'+$miss.term+'"]').val('');
							$('input[for-term="'+$miss.term+'"]').attr('readonly', true);
						}
						
					});
		

					// add autocomplete to the search field:
					$('input[for-term="'+$miss.term+'"]').autocomplete({
						source: function( request, response ) {
							
							// query based on user input:
							var $query = 'prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> prefix skos: <http://www.w3.org/2004/02/skos/core#> prefix hxl: <http://hxl.humanitarianresponse.info/ns/#> prefix dct: <http://purl.org/dc/terms/>  prefix foaf: <http://xmlns.com/foaf/0.1/> prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT DISTINCT ?uri ?label ?typelabel ?pcode ?loc WHERE {'+$miss.predicate+' rdfs:range ?range . ?uri rdf:type/rdfs:subClassOf* ?range; a ?type . { ?type skos:prefLabel ?typelabel } UNION { ?type rdfs:label ?typelabel } { ?uri hxl:featureRefName ?label } UNION { ?uri hxl:commonTitle ?label }UNION { ?uri dct:title ?label } UNION { ?uri foaf:name ?label } UNION { ?uri hxl:abbreviation ?label } UNION { ?uri hxl:adminUnitLevelTitle ?label } UNION { ?uri hxl:orgName ?label } UNION { ?uri hxl:title ?label } OPTIONAL {?uri hxl:atLocation* ?location ; hxl:pcode ?pcode . ?location hxl:featureName ?loc; a hxl:Country . } FILTER regex(?label, "'+request.term+'", "i") } ORDER BY ?label';

							
							$('#modal-loading').show();
							$.ajax({
								url: 'http://hxl.humanitarianresponse.info/sparql',
								headers: {
									Accept: 'application/sparql-results+json'
								},
								data: { 
									query: $query 
								},							
								success: function( data ) {
									if(!data.results.bindings.length){ // no results
										response([{
											value: 'No matching results found.',
											uri: '<>'
										}]);
									}else{
										response( $.map( data.results.bindings, function( result ){
											// special handling for features:
											if(result.loc != undefined && result.pcode != undefined){
												return {
													value: result.label.value+ ' ('+result.typelabel.value+' in '+result.loc.value+', P-Code: '+result.pcode.value+')',
													uri: result.uri.value
												}
											}else{
												return {
												value: result.label.value+' ('+result.typelabel.value+')',
												uri: result.uri.value
											}	
											}	
																					
										}));	
									}
									
									$('#modal-loading').hide();
								},
								error: function($jqXHR, $textStatus, $errorThrown){
									console.error($textStatus);
								}
							});
						},
						minLength: 1,
						select: function( event, ui ) {
							// Add one option to the radio list and select it:
							$('p[missing-term="'+$miss.term+'"]').before('<label class="radio"><input type="radio" name="'+$miss.term+'" checked class="rdio" value="'+ui.item.uri+'">'+ui.item.value+'<br /><small><a href="'+ui.item.uri+'" target="_blank">'+ui.item.uri+'</a></small></label>');							
							// empty and deselect input box by triggering change event
							$('input[name="'+$miss.term+'"]').change(); 

						}
					});

							// if this is the last term, hide the loader gif:
							if($i == $missing.length-1){
								$('#modal-loading').hide();
							}							
						},
						error: function($jqXHR, $textStatus, $errorThrown){
							console.error($textStatus);
						}
					});
			
		});

		$('#storeLookUps').click(function(){

			// fetch all selected URIs and add them to the mapping object:
			$('input:checked').each(function(){
				console.log("adding "+$(this).attr('value'));
				$mapping.lookup[$(this).attr('name')] = '<'+$(this).attr('value')+'>';
			});
			
			
			if($final == true){

				//initiating final translation:
				generateFinalRDF($mapping); 
				
			} else {
				// push mapping to mapping stack:
				$hxlHistory.pushState($mapping);
		
				$('#mappingModal').modal('hide');
	
			}

		});

		$(this).slideDown();
	});
}

// generates the final RDF
function generateFinalRDF($mapping){
	$('#fire').unbind();
    var $samplerow = $mapping.samplerow.split('-')[1];
    
    // iterate through all templates in the mapping and copy them for each highlighted row,
	// replacing the row index in each @value, @uri and @lookup values
	$.each($mapping.datacontainers, function($c, $datacontainer){
		$.each($datacontainer, function($uri, $template){				
	        // only do that for URIs generated from the spreadsheet:
			// and for each row EXCEPT the sample row!
			if($uri.indexOf('@uri') == 0){
				$('tr.hxlatorrow.selected').each(function(){
	                var $thisRow = $(this).attr('data-rowid').split('-')[1];
					// make sure we don't overwrite the samplerow:
	                if($thisRow != $samplerow){
	                    // replace all @value, @uri and @lookup values according to the current row
					    // and add these back to the mapping as a new template:
					    var $oldURI = $uri.split('-');
					    var $newURI = $oldURI[0]+'-'+$oldURI[1]+'-'+$thisRow;

					    $datacontainer[$newURI] = new Object();				                
					    
					    // now go through all triples and copy them over:
					    $datacontainer[$newURI].triples = new Array();	
					    
					    $.each($template.triples, function($i, $triple){				        
					        $datacontainer[$newURI].triples[$i] = $.extend(true, {}, $template.triples[$i]);
					        // replace the row if there is an @uri, @lookup, or @value tag in the object:
					        if($datacontainer[$newURI].triples[$i].object.indexOf('@') == 0){
					            // only move forward if the @ reference is to a value in the sample row
					            // if this is not the case, this is a mapping to some other cell
					            // (e.g. in the header of the sheet) and must not be changed!
					            var $maprow = $datacontainer[$newURI].triples[$i].object.split('-');
					            if($samplerow == $maprow[2]){
					                $datacontainer[$newURI].triples[$i].object = $maprow[0]+'-'+$maprow[1]+'-'+$thisRow;
					            }
					        }    
					    });
					    
	                }																

				});			
			}		
		});
	});
    
    $hxlHistory.pushState($mapping);
    
    // add a submit button to the preview modal and show it, 
	// so that the user can do a last check and then submit:
	$('#hxlPreview > .modal-footer').html('<p><i class="icon-hand-right"></i> Please check the generated data one last time before you submit them for approval.</p><a href="#" id="fire" class="btn btn-success">Submit HXL data for approval</a><a href="#" class="btn" data-dismiss="modal">Cancel</a>');
    $('#fire').click(function(){
		$('#hxlPreview > .modal-body').slideUp(function(){
			$('#hxlPreview > .modal-header').html('<h3><img src="img/loader.gif" style="width: 25px; height: 25px" /> Uploading data...</h3>');
			$('#hxlPreview > .modal-footer').slideUp();
		});

		$('#hxlPreview > .modal-body').html('<p>The following data containers have been submitted for approval:</p>');

		// only save the translator if it hasn't been saved before:
		if(!$recycle){
			saveTranslator($mapping);				
		}else{
			$('#hxlPreview > .modal-body').slideDown(function(){
				$('#hxlPreview > .modal-footer').slideDown();
			});		
		}

		// upload all datacontainers
		var turtles = generateRDF($mapping);
		$.each(turtles, function(i, turtle){
			$.post('container-submit.php', { hxl: turtle }, function($data){
				
				$('#hxlPreview > .modal-body').append($data);	

				$('#hxlPreview > .modal-header').html('<h3>Upload complete.</h3>');
					
				
			});
		});
		
		$('#hxlPreview > .modal-footer').html('<p class="lead"><a href="index.php" class="btn">HXLate another spreadsheet</a></p>');		
				
	});

	$('#mappingModal').modal('hide');
    $('#hxlPreview').modal('show');    
}

// saves the mapping via AJAX under the user's name
function saveTranslator($mapping){
	$.post('store-mapping.php', { mapping: JSON.stringify($mapping) }, function($data){
		$('#hxlPreview > .modal-body').prepend($data);
		$('#hxlPreview > .modal-body').slideDown(function(){
				$('#hxlPreview > .modal-footer').slideDown();
			});
	});
	
}

// fetches the cell contents from the table cell with id $cellID
function getCellContents($cellID){
	if ($('td[data-cellid="'+$cellID+'"]').length == 0){
		console.error('getCellContents failed: There is no cell with ID '+$cellID);
		return '';		
	} else {
		return $('td[data-cellid="'+$cellID+'"]').html();
	} 
}

// ---------------------------------------------------
// RDF generation
// ---------------------------------------------------

// processes a mapping, generates RDF from it and updates the preview modal
function generateRDF($inputMapping){
	// we'll be manipulation the mapping a bit, so we copy it first to make sure the original remains untouched:
	var $mapping = $.extend(true, {}, $inputMapping);

	var $html = '';
	var $turtles = new Array();

	$.each($mapping.datacontainers, function($t, $templates){

		var $turtle = '@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> . \r\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . \r\n@prefix owl:  <http://www.w3.org/2002/07/owl#> . \r\n@prefix foaf: <http://xmlns.com/foaf/0.1/> . \r\n@prefix dc:   <http://purl.org/dc/terms/> . \r\n@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> . \r\n@prefix skos: <http://www.w3.org/2004/02/skos/core#> . \r\n@prefix hxl:  <http://hxl.humanitarianresponse.info/ns/#> . \r\n@prefix geo:  <http://www.opengis.net/geosparql#> . \r\n@prefix label: <http://www.wasab.dk/morten/2004/03/label#> . \r\n \r\n';
	
		$.each($templates, function($uri, $triples){
			
			// first go through the whole mapping object once and replace all @value and @lookup occurrences with the actual values from the spreadsheet:
			$.each($triples['triples'], function($i, $triple){

				// values from spreadsheet:
				if($triple['object'].indexOf('@value') == 0){	
					$triple['object'] = getCellContents($triple['object'].substr(7));
				}

				// values from spreadsheet, then map those to existing URIs:
				if($triple['object'].indexOf('@lookup') == 0){				
					var $lookupterm = getCellContents($triple['object'].substr(8));

					// check if we already have the term in our lookup "dictionary"
					if($mapping.lookup[$lookupterm] == undefined){
						$triple['object'] = '@notfound: '.$lookupterm; // mark for later

						// HIER WEITER

					} else {
						$triple['object'] = $mapping.lookup[$lookupterm];
					}
				}			
			});
			
			// this is the case if the URI is already there:
			$resuri = $uri;

			var $comment = ''; // we'll use this in case the lookup fails

			// generate a URI if the $uri is not there yet (tagged with "@uri")
			// (overwriting what we had before)
			if($uri.indexOf('@uri') == 0){
			
				// go through all properties of the resource and generate a URI based on our URI patterns document:
				// https://docs.google.com/document/d/1-9OoF5vz71qPtPRo3WoaMH4S5J1O41ITszT3arQ5VLs/edit
				
				var $classslug = $mapping.classplural.toLowerCase().replace( /\s/g, '' );

				// populations:
				if($mapping.classuri == 'hxl:Population' || $mapping.classuri == 'hxl:AffectedPopulation' || $mapping.classuri == 'hxl:TotalPopulation' || $mapping.classuri == 'hxl:Casualty' || $mapping.classuri == 'hxl:Displaced' || $mapping.classuri == 'hxl:NonDisplaced' || $mapping.classuri == 'hxl:Death' || $mapping.classuri == 'hxl:Injury' || $mapping.classuri == 'hxl:Missing' || $mapping.classuri == 'hxl:IDP' || $mapping.classuri == 'hxl:Others' || $mapping.classuri == 'hxl:RefugeesAsylumSeekers' || $mapping.classuri == 'hxl:HostPopulation' || $mapping.classuri == 'hxl:NonHostPopulation') {

					var $loc = '';
					var $sex = '';
					var $age = '';
					

					// check whether location, sex and age categories are set:
					$.each($mapping.datacontainers, function($tt, $ttemplates){
						$.each($ttemplates, function($uuri, $ttriples){
							if($uri == $uuri){
								$.each($ttriples['triples'], function($i, $triple){
									if ($triple['predicate'] == 'hxl:atLocation'){
										if(typeof $triple['object'] == 'undefined'){
											$loc = '/unknownLocation';
											$comment = 'Missing lookup value';
										}else if ($triple['object'].indexOf('@lookup') == 0){
											$loc = '/unknownLocation';
											$comment = 'Missing lookup value for term ' + $triple['object'].substr(8);
										}else{
											// grab URI and remove < and >
											var $place = $triple['object'].substr(1, $triple['object'].length-2);
											// strip the country and p-code from the URI (last two parts of URI):
											var $placeURIparts = $place.split('/');
											$loc = '/' + $placeURIparts[$placeURIparts.length - 2] + '/' + $placeURIparts[$placeURIparts.length - 1];											
										}
										
									}else if ($triple['predicate'] == 'hxl:sexCategory'){
										if (typeof $triple['object'] == 'undefined'){
											$sex = '/unknownSex';
											$comment = 'Missing lookup value';
										} else if ($triple['object'].indexOf('@lookup') == 0){
											$sex = '/unknownSex';
											$comment = 'Missing lookup value for term ' + $triple['object'].substr(8);
										} else {
											// grab URI and remove < and >
											var $sexCategory = $triple['object'].substr(1, $triple['object'].length-2);
											var $sexCategoryURIparts = $sexCategory.split('/');
											$sex = '/' + $sexCategoryURIparts[$sexCategoryURIparts.length -1];
										}
									}else if ($triple['predicate'] == 'hxl:ageGroup'){
										if (typeof $triple['object'] == 'undefined'){
											$age =  '/unknownAgeGroup';
											$comment = 'Missing lookup value';
										}else if ($triple['object'].indexOf('@lookup') == 0){
											$age =  '/unknownAgeGroup';
											$comment = 'Missing lookup value for term ' + $triple['object'].substr(8);
										} else {
											// grab URI and remove < and >
											var $ageGroup = $triple['object'].substr(1, $triple['object'].length-2);
											var $ageGroupURIparts = $ageGroup.split('/');
											$age = '/'+$ageGroupURIparts[$ageGroupURIparts.length -1 ];
										} 
									}
								});
							}							
						});
					});

					var $resuri = '<http://hxl.humanitarianresponse.info/data/' + $classslug + $loc +  $sex + $age + '>';

				} else if($mapping.classuri == 'hxl:Emergency') {
					
					// random GLIDE number for now
					var $glide = '/unknownGLIDEnumber';

					$.each($mapping.datacontainers, function($tt, $ttemplates){
						$.each($ttemplates, function($uuri, $ttriples){
							if($uri == $uuri){
					
								// check whether the hasGLIDEnumber property is set:
								$.each($ttriples['triples'], function($i, $triple){
									if ($triple['predicate'] == 'hxl:hasGLIDEnumber'){
										$glide = '/'+$triple['object'];						
									}
								});

							}
						});
					});	
					
					var $resuri = '<http://hxl.humanitarianresponse.info/data/' + $classslug + $glide;
					

	    		} else if($mapping.classuri == 'hxl:APL') {

					var $loc = '/unknownLocation';
					var $pcode = '/unknownPcode';
					
					// check whether location, sex and age categories are set:

					$.each($mapping.datacontainers, function($tt, $ttemplates){
						$.each($ttemplates, function($uuri, $ttriples){
							if($uri == $uuri){

								$.each($ttriples['triples'], function($i, $triple){
									if ($triple['predicate'] == 'hxl:atLocation'){
										// grab URI and remove < and >
										var $place = $triple['object'].substr(1, $triple['object'].length-2);
										// strip the country and p-code from the URI (last two parts of URI):
										var $placeURIparts = $place.split('/');
										// we use only the country code
										$loc = '/' + $placeURIparts[$placeURIparts.length - 2];
									}else if ($triple['predicate'] == 'hxl:pcode'){
										// grab URI and remove < and >
										$pcode = '/' + $triple['object'];	
									}
								});
							}
						});
					});

	    			// example: http://hxl.humanitarianresponse.info/data/locations/apl/bfa/UNHCR-POC-80
	    			var $resuri = '<http://hxl.humanitarianresponse.info/data/locations/apl' + $loc + $pcode + '>';			

	    		} else if($mapping.classuri == 'hxl:Organisation') {

	    			// random acronym for now:
	    			var $acro = '';

	    			$.each($mapping.datacontainers, function($tt, $ttemplates){
						$.each($ttemplates, function($uuri, $ttriples){
							if($uri == $uuri){

				    			// check if the acronym is set:
				    			$.each($ttriples['triples'], function($i, $triple){
				    				if ($triple['predicate'] == 'hxl:abbreviation'){
				    					// remove blanks, just in case...
				    					$acro = '/' + $triple['object'].toLowerCase().replace( /\s/g, '' );;					
				    				}
				    			});
				    		}
				    	});
				    });		

	    			var $resuri = '<http://hxl.humanitarianresponse.info/data/' + $classslug + $acro + '>';

	    		} else {
	    			console.error('Error during URI generation');
	    			$resuri = '<http://some.error/crap>'; 
	    		}
	  

				// type this URI with the standard type selected by the user *if there is no other type given*
				var $typed = false;
				$.each($triples['triples'], function($i, $triple){
					if ($triple['predicate'] == 'rdf:type'){
						$typed = true;
					}
				});

				if ( !$typed ) {
					$turtle += $resuri + ' rdf:type ' + $mapping.classuri + ' .\r\n';
				}

				if( $comment != ''){
					$turtle += $resuri + ' rdfs:comment "' + $comment + '"@en .\r\n';	
				}
			}
		
			$.each($triples['triples'], function($i, $triple){
				
				// handling the triples object:
				var $object = '';
				if(typeof $triple['object'] != 'undefined'){
					if($triple['object'].indexOf('<http') == 0){ // object property
						$object = $triple['object'];
					}else if($triple['object'].indexOf('http') == 0){ // object property
						$object = '<'+$triple['object']+'>';
					}else{ // data property
						$object = '"'+$triple['object']+'"';
					}
				
					
					var $datatype = '';
					if ($triple['datatype'] != undefined){
						$datatype  = '^^' + $triple['datatype'];
					}
				}				
				
				// add the triple, but ONLY if the object is not empty and the lookup did work:
				if($object != '' && $object.indexOf('"@value') != 0 && $object.indexOf('"@lookup') != 0 && $object.indexOf('"@userlookup') != 0){			
					$turtle += $resuri + ' ' + $triple['predicate'] + ' ' + $object + $datatype + ' .\r\n';
				}

			});
		});

		$html += '<pre>'+htmlentities($turtle, 0)+'</pre>';
		$turtles.push($turtle);

	});
	// update the preview modal:
	$('#nakedturtle').html($html);
	// update the preview table:
	updateTablePreview($mapping);
	return $turtles;
}


// generates a table preview from the "pre-processed" mapping JSON passed over by generateRDF()
function updateTablePreview($mapping){
	
	var $table = '<p>A table-based preview of your spreadsheet, translated into HXL. You can sort by each column by clicking the column header, or filter using the search field:</p><table id="previewTable" class="table table-hover table-bordered table-condensed">';
	
	// go through all triples and figure out how many distinct properties we have, 
	// so that we know the number of columns in the table:
	var $predicates = new Array();

	$.each($mapping.datacontainers, function($t, $templates){
		$.each($templates, function($uri, $triples){
			if($uri.indexOf('@uri') == 0){   // ignore the metadata stuff
				$.each($triples['triples'], function($i, $triple){
					if($.inArray($triple['predicate'], $predicates) == -1){
						$predicates.push($triple['predicate']);
					}
				});
			}
		});
	});

	$table += '<thead><tr>';
	$table += '<th>'+$mapping.classsingular+' in cell...</th>';
	$.each($predicates, function($i, $p){		
		$table += '<th>'+$p.substr(4)+'</th>';	
	});
	$table += '</tr></thead>';
	$table += '<tbody>';
	
	var $templateCounter = 0;

	$.each($mapping.datacontainers, function($t, $templates){
		$.each($templates, function($subjuri, $triples){
		    if($subjuri.indexOf('@uri') == 0){   // ignore the metadata stuff
	    	    $table += '<tr>';
		        $table += '<th>'+$subjuri.substr(5)+'</th>';
		        // now go through all predicates and check whether we have a value for this one:
		        $.each($predicates, function($j, $p){		
		        	$table += '<td>';
		        	var $cellContent = '';
		        	if ($p == 'rdf:type') $cellContent = $mapping.classsingular;
		        	
		        	$.each($triples['triples'], function($i, $triple){
		        	    if($triple['predicate'] == $p){
		        	    	if(typeof $triple['object'] != 'undefined'){
		        	    		if($triple['object'].indexOf('<') == 0){
								
			        			var $uri = $triple['object'];

	    		        		// get the name for this URI, either from the global $names object, or, if it is not there yet,
								// via AJAX (and then add it to the $names object for future use)

								if($names[$uri] == undefined){
									$('#loading').show();
									$query = 'prefix skos: <http://www.w3.org/2004/02/skos/core#>  prefix hxl: <http://hxl.humanitarianresponse.info/ns/#> prefix foaf: <http://xmlns.com/foaf/0.1/> SELECT * WHERE { {'+$uri+' hxl:title ?name .} UNION {'+$uri+' hxl:featureName ?name .} UNION {'+$uri+' foaf:name ?name .} UNION {'+$uri+' skos:prefLabel ?name .} UNION {'+$uri+' hxl:abbreviation ?name .} UNION {'+$uri+' hxl:commonTitle ?name .} UNION {'+$uri+' hxl:orgName ?name .}}'; 
									$.ajax({
										async: false,
										url: 'http://hxl.humanitarianresponse.info/sparql',
										headers: {
											Accept: 'application/sparql-results+json'
										},
										data: { 
											query: $query 
										},							
										success: function( data ) { 
											$.map( data.results.bindings, function( result ) {
											 	$names[$uri] = result.name.value;
											 	$cellContent = '<a href="'+$uri.substr(1,$uri.length-2)+'" target="_blank">'+result.name.value+'</a>';										 	
											});

											$('#loading').hide();
										},
										error: function($jqXHR, $textStatus, $errorThrown){
											console.error($textStatus);
										}
									});
								}else{
									$cellContent = '<a href="'+$uri.substr(1,$uri.length-2)+'" target="_blank">'+$names[$uri]+'</a>';							   
								}
							} else if ($triple['object'].indexOf('@lookup') == 0) {
								
								// lookup failed, skip this value
	    		            
	    		            } else { 
	    		            
	    		            	// simple data property
	    		                $cellContent = $triple['object'];
			        	        
	    		            }
		        	    	}			        		
			        	}
			        		        	
			        });

					$table += $cellContent;

					if($table.indexOf(' | ', $table.length - 3) !== -1){
					    $table = $table.substring(0, $table.length -3);
					}
			        $table += '</td>';
		        });
		        $table += '</tr>';   
		    }	    
		});
	});

	$table += '</tbody></table>';
	$('#previewtabtable').html($table);
	$('#previewTable').dataTable( {
		"bPaginate": false
	});
}





// Marks all cells and properties that have already been mapped with a green dot
function tagMappedCellsAndProps($mapping){
	
	// remove all, in case we're coming back:
	$('td.hxlatorcell').removeClass('mapped');
	$('a.hxlprop').removeClass('mapped');

	// iterate through mapping and count occurrences of cells and properties:
	$.each($mapping.datacontainers, function($t, $templates){
		$.each($templates, function($uri, $triples){
			
			// find cell mappings in subject URIs:
			if($uri.indexOf('@uri') == 0){
				$('td.hxlatorcell[data-cellid="'+$uri.substr(5)+'"]').addClass('mapped');			
			}

			// find cell mappings in object URIs, and list properties 
			$.each($triples['triples'], function($i, $triple){

				$('a.hxlprop[data-hxl-uri="'+$triple['predicate']+'"]').addClass('mapped');

				// values from spreadsheet:
				if($triple['object'].indexOf('@value') == 0){				
					$('td.hxlatorcell[data-cellid="'+$triple['object'].substr(7)+'"]').addClass('mapped');							
				}

			});
		});
	});	

	// hover lister for all mapped cells, highlighting all properties the cell has been mapped to
	// unbind first, just in case
	$('td.hxlatorcell.mapped').unbind();
	$('td.hxlatorcell.mapped').hover(
		function(){ // mouse enter
			var $cellid = $(this).attr('data-cellid');
			// go through mapping and find all properties this cell has been mapped to:
			$.each($mapping.datacontainers, function($t, $templates){
				$.each($templates, function($uri, $template){
					if($uri.indexOf($cellid) != -1){
						$.each($template.triples, function($i, $triple){
							$('a.btn.hxlprop[data-hxl-uri="'+$triple.predicate+'"]').addClass('btn-success');
						});
					}			
				});
			});
		},
		function(){ // mouse leave
			$('a.hxlprop.btn-success').removeClass('btn-success');
		}
	);

}

// allow the user to temporarily hide the mapping modal to peek at their spreadsheet


var hideHandler = function(){
	if (event.altKey==1 && event.keyCode == 75){ // ALT+K
		$(document).unbind('keydown', hideHandler);
		// only move on if the modal is visible:
		if($('#mappingModal').is(":visible")){
			$('#mappingModal').modal('hide');
			$('.shortguide').slideUp().after('<div class="container alt-k-instructions"><div class="alert alert-info">Press <code>ALT-K</code> again to go back to the mapping window.</div></div>');
			$(document).bind('keydown', showHandler);
			$(document).focus();
		}
	} else if (event.keyCode == 27) { // escape key
		$(document).unbind('keydown', hideHandler);
		$(document).focus();
	}	
};

var showHandler = function(){
	if (event.altKey==1 && event.keyCode == 75){ // ALT+K
		// only move on if the modal is hidden:
		if($('#mappingModal').is(":hidden")){
			$(document).unbind('keydown', showHandler);
			$('#mappingModal').modal('show');
			$('.alt-k-instructions').remove();
			$('.shortguide').slideDown();
			$(document).focus();
		}
	}
};


// Watch the mappingModal: if it is shown, enable the ALT-K shortcut to hide it:
$('#mappingModal').on('shown', function(){
	$(document).bind('keydown', hideHandler);
});



// ---------------------------------------------------
// Convenience functions
// ---------------------------------------------------


// a generic error display for hxlate.php. Will show $msg in a red alert box on top of the page
function hxlError($msg){
	$('.shortguide').prepend('<div class="alert alert-block alert-error fade in"><button type="button" class="close" data-dismiss="alert">×</button><h4 class="alert-heading">'+$msg+'</h4></div>');
}


// turns our turtle code into something we can show to the user:
// courtesy of http://css-tricks.com/snippets/javascript/htmlentities-for-javascript/
function htmlentities(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// finally, make sure the user doesn't go back through the browser's back button:
window.onbeforeunload = function (e) {
  var message = "You are about to leave this page and lose your current HXL mapping. If you have made a mistake in your mapping process, you can go back to the previous step by clicking the HXL back button at the top left.",
    e = e || window.event;
	  // For IE and Firefox
	if (e) {
	    e.returnValue = message;
	}
	
	// For Safari
	return message;
};

// Array Remove - By John Resig (MIT Licensed)
Array.prototype.remove = function(from, to) {
  var rest = this.slice((to || from) + 1 || this.length);
  this.length = from < 0 ? this.length + from : from;
  return this.push.apply(this, rest);
};

// removes leading/trailing whitespaces from a string, plus multiple whitespaces are reduced to just 1; via http://www.qodo.co.uk/blog/javascript-trim-leading-and-trailing-spaces
function trim(s) {
	s = s.replace(/(^\s*)|(\s*$)/gi,"");
	s = s.replace(/[ ]{2,}/gi," ");
	s = s.replace(/\r\n /,"\r\n");
	return s;
}

function debug($obj){
	if ($debug) console.log($obj);
}