<?php 

	include_once('functions.php');
	
	echo getClassPills();
	
	function getClassPills($superclass = null, $superclassLabel = null, $superclassLabelPlural = null){
		
		$recursionClasses = array();
		
		if($superclass == null){
			$hxlClasses = sparqlQuery('SELECT  ?class ?label ?plural ?description (COUNT(?subsub) as ?subsubCount) WHERE {  
		  		?class  hxl:topLevelConcept "true"^^xsd:boolean ;
					skos:prefLabel ?label  ;
					label:plural ?plural ;     
				  	rdfs:comment ?description .
			  	OPTIONAL { ?subsub rdfs:subClassOf ?class }
			} GROUP BY ?class ?label ?plural ?description ORDER BY ?label');
			
			$pills = '<div class="span3"><ul class="nav nav-pills nav-stacked hxl-pills">
			';
			
		} else {
			$hxlClasses = sparqlQuery('SELECT  ?class ?label ?plural ?description (COUNT(?subsub) as ?subsubCount) WHERE {  
			  	?class  rdfs:subClassOf <'.$superclass.'> ;
					skos:prefLabel ?label  ;  
					label:plural ?plural ;   
				  	rdfs:comment ?description .
			  	OPTIONAL { ?subsub rdfs:subClassOf ?class }
			} GROUP BY ?class ?label ?plural ?description ORDER BY ?label ');
			
			$pills = '<div class="span3 hxl-hidden" subclassesof="'.shorten($superclass).'"><ul class="nav nav-pills nav-stacked hxl-pills">
			';
						
		}
		
		
		$label = "label";
		$plural = "plural";
		$class = "class";
		$description = "description";	  	
		$count = "subsubCount";	  			
					
		
		
		foreach($hxlClasses as $hxlClass){	  	
			if($hxlClass->$count != "0") { 
				$pills .= '<li class="solo"><a href="#" class="hxlclass hxlclass-expandable" rel="popover" title="'.$hxlClass->$label.'" data-content="'.$hxlClass->$description.' <br /><small><strong>Click to view '.$hxlClass->$count.' subclasses.<strong></small>" classuri="'.shorten($hxlClass->$class).'">'.$hxlClass->$plural.'<span class="badge badge-inverse pull-right">'.$hxlClass->$count.'</span>'; 
				// we're gonna show subclasses for this one:
				$recursionClasses[] = array($hxlClass->$class, $hxlClass->$label, $hxlClass->$plural);
			}else{
				$pills .= '<li class="solo"><a href="#" class="hxlclass hxlclass-selectable" rel="popover" title="'.$hxlClass->$label.'" singular="'.$hxlClass->$label.'" plural="'.$hxlClass->$plural.'" data-content="'.$hxlClass->$description.'" classuri="'.shorten($hxlClass->$class).'">'.$hxlClass->$plural;
			}
			
			$pills .= '</a></li>';
		}
	
		if($superclass != null){
			$pills .= '<li><a href="#" class="hxlclass hxlclass-selectable" rel="popover" title="Different '.$superclassLabelPlural.'" data-content="Select this option if you have a mix of different '.$superclassLabelPlural.' in your data." classuri="'.shorten($superclass).'" singular="'.$superclassLabel.'" plural="'.$superclassLabelPlural.'">It is a <em>mix</em> of those. <i class="icon-random pull-right"></i></a></li>';
		}
		
		$pills .= '</ul></div>
		';
		
		foreach ($recursionClasses as $recClass) {
			$pills .= getClassPills($recClass[0], $recClass[1], $recClass[2]);
		}
		
		return $pills;
	}
?>