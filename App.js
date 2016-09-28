Ext.define('CustomApp', {
	extend: 'Rally.app.TimeboxScopedApp',
	scopeType: 'release',
	
	noFeatureId: 3,
	noInvestmentCategory: 'Unplanned Stories',
	noInvestmentColor: '#666',
	
	cvFeatureId: 1,
	cvInvestmentCategory: 'CV Defects',
	cvInvestmentColor: '#FF8200',
	
	defectFeatureId: 2,
	defectInvestmentCategory: 'non-CV Defects',
	defectInvestmentColor: '#F6A900',
	
	colors: [ '#B81B10', '#FAD200', '#F66349', '#FFDD82' ],
	
	chartColors: [],
	features: [],
	workItems: [],
	totalPoint: 0,
	
	onScopeChange: function( scope ) {
		this.callParent( arguments );
		this.start( scope );
	},
	
	start: function( scope ) {
		// Delete any existing UI components
		if( this.down( 'rallychart' ) ) {
			this.down( 'rallychart' ).destroy();
		}
		if( this.down( 'label' ) ) {
			this.down( 'label' ).destroy();
		}
		
		// Show loading message
		this._myMask = new Ext.LoadMask( Ext.getBody(),
			{
				msg: "Loading work items..."
			}
		);
		this._myMask.show();
		
		// Load all the work items for this release
		var dataScope = this.getContext().getDataContext();
		var store = Ext.create(
			'Rally.data.wsapi.artifact.Store',
			{
				models: ['UserStory','Defect'],
				fetch: ['ObjectID','PlanEstimate','Feature','Tags'],
				filters: [
					{
						property: 'Release.Name',
						value: scope.record.data.Name
					} /*,  //Only look at accepted work items
					{
						property: 'ScheduleState',
						operator: '>=',
						value: 'Accepted'
					} */
				],
				context: dataScope,
				limit: Infinity
			},
			this
		);
		
		// Resetting global variables
		this.features = {};
		
		this.features[ this.cvFeatureId ] = {};
		this.features[ this.cvFeatureId ].estimate = 0;
		this.features[ this.cvFeatureId ].investmentCategory = this.cvInvestmentCategory;
		this.chartColors.push( this.cvInvestmentColor );
		
		this.features[ this.defectFeatureId ] = {};
		this.features[ this.defectFeatureId ].estimate = 0;
		this.features[ this.defectFeatureId ].investmentCategory = this.defectInvestmentCategory;
		this.chartColors.push( this.defectInvestmentColor );
		
		this.features[ this.noFeatureId ] = {};
		this.features[ this.noFeatureId ].estimate = 0;
		this.features[ this.noFeatureId ].investmentCategory = this.noInvestmentCategory;
		this.chartColors.push( this.noInvestmentColor );
		
		this.workItems = [];
		this.totalPoints = 0;
		
		store.load( {
				scope: this,
				callback: function( records, operation ) {
					if( operation.wasSuccessful() ) {
						if (records.length > 0) {
								_.each(records, function(record){
									var featureId = this.noFeatureId;
									if ( record.raw.Tags && ( _.find( record.raw.Tags._tagsNameArray, function( tag ) {
												return ( tag.Name == 'Customer Voice' );
											} ) ) ) {
										featureId = this.cvFeatureId;
									} else if ( record.raw.Feature ) {
										featureId = record.raw.Feature.ObjectID;
									} else if ( record.get('_type') == 'defect' ) {
										featureId = this.defectFeatureId;
									}
									if( !( featureId in this.features ) ) {
										this.features[ featureId ] = {};
										this.features[ featureId ].estimate = 0;
										this.features[ featureId ].investmentCategory = this.noInvestmentCategory;
									}
									this.features[ featureId ].estimate += record.raw.PlanEstimate;
									this.totalPoints += record.raw.PlanEstimate;
								},this);
							
							this._myMask.msg = 'Loading Features...';
							this.loadFeatures( 0 );
						}
						else if(records.length === 0 && this.features.length === 0){
								this.showNoDataBox();	
						}
					}
				}
		});
	},
	
	loadFeatures: function( featureIndex ) {
		var keys = Object.keys( this.features );
		
		if ( featureIndex >= keys.length ) {
			this.compileData();
		} else if ( ( keys[ featureIndex ] == this.noFeatureId ) ||
					( keys[ featureIndex ] == this.defectFeatureId ) ||
					( keys[ featureIndex ] == this.cvFeatureId ) ) {
			this.loadFeatures( featureIndex + 1 );
		} else {
			// Set a default as an error here
			this.features[ keys[ featureIndex ] ].investmentCategory = 'Unknown';
			
			var dataScope = {
				workspace: this.getContext().getWorkspaceRef(),
				project: null
			};
			
			var store = Ext.create(
				'Rally.data.wsapi.artifact.Store',
				{
					models: ['PortfolioItem/Feature'],
					fetch: ['ObjectID','InvestmentCategory'],
					filters: [
						{
							property: 'ObjectID',
							value: keys[ featureIndex ]
						}
					],
					context: dataScope,
					limit: Infinity
				},
				this
			);
			
			store.load( {
				scope: this,
				callback: function( records, operation ) {
					if( operation.wasSuccessful() ) {
						if (records.length > 0) {
							_.each(records, function( record ){
								var featureId = record.raw.ObjectID;
								this.features[ featureId ].investmentCategory = record.raw.InvestmentCategory;									
							},this);
						}
					}	
					this.loadFeatures( featureIndex + 1 );
				}
			});
		}
	},
	
	compileData: function(){
		this._myMask.msg = 'Compiling Data...';
		
		var investmentSums = {};
		_.each( this.features, function( feature ) {
			if( !( feature.investmentCategory in investmentSums ) ) {
				investmentSums[ feature.investmentCategory ] = 0;
				
				// push on more colors if we're past the first set of sums
				var keysLength = Object.keys( investmentSums ).length;
				if ( keysLength > 3 ) {
					this.chartColors.push( this.colors[ ( keysLength - 4 ) % this.colors.length ] );
				}
			}
			investmentSums[ feature.investmentCategory ] += feature.estimate;
		}, this);
		
		var series = [];
		series.push( {} );
		series[0].name = 'Investment Categories';
		series[0].colorByPoint = true;
								
		series[0].data = [];
		_.each( _.keys( investmentSums ), function( investmentCategory ) {
			series[0].data.push(
				{
					name: investmentCategory,
					y: investmentSums[ investmentCategory ] / this.totalPoints
				}
			);
		}, this );
							
		this.makeChart( series );
	},
	
	makeChart: function( series ){
		var chart = this.add({
				xtype: 'rallychart',
				chartConfig: {
					chart:{
						type: 'pie'
					},
					title:{
						text: 'Investment Category Spend'
					},
					tooltip: {
						pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b>'
					},
					plotOptions: {
						pie: {
							allowPointSelect: true,
							cursor: 'pointer',
							dataLabels: {
								enabled: true,
								format: '<b>{point.name}</b>: {point.percentage:.1f} %'
							}
						}
					}
				},
									
				chartData: {
					series: series
				}
		});
		
		// Workaround bug in setting colors - http://stackoverflow.com/questions/18361920/setting-colors-for-rally-chart-with-2-0rc1/18362186
		chart.setChartColors( this.chartColors );
		
		this._myMask.hide();
	},
	
	showNoDataBox:function(){
		this._myMask.hide();
		this.add({
			xtype: 'label',
			text: 'There is no data. Check if there are work items assigned for the Release.'
		});
	}
});