Ext.define('CustomApp', {
	extend: 'Rally.app.TimeboxScopedApp',
	scopeType: 'release',
	
	CAIntesnts: [ "Avoid Costs", "Reduce Costs", "Protect Revenue", "Create Revenue" ],
	customerPerceivedValues: [ "Enabler", "Table Stakes", "Competitive", "Differentiator" ],
	
	workItems: [],
	features: [],
	initiatives: [],
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
				msg: "Loading..."
			}
		);
		this._myMask.show();
		
		// Load all the work items for this release
		var dataScope = this.getContext().getDataContext();
		var store = Ext.create(
			'Rally.data.wsapi.artifact.Store',
			{
				models: ['UserStory','Defect'],
				fetch: ['ObjectID','PlanEstimate','Feature'],
				filters: [
					{
						property: 'Release.Name',
						value: scope.record.data.Name
					}
				],
				context: dataScope,
				limit: Infinity
			},
			this
		);
		
		// Resetting global variables
		this.features = {};		
		this.workItems = [];
		this.totalPoints = 0;
		
		store.load( {
				scope: this,
				callback: function( records, operation ) {
					if( operation.wasSuccessful() ) {
						if (records.length > 0) {
								_.each(records, function(record){
									if ( record.raw.Feature ) {
										var featureId = record.raw.Feature.ObjectID;
										if( !( featureId in this.features ) ) {
											this.features[ featureId ] = {};
											this.features[ featureId ].estimate = 0;
											this.features[ featureId ].initative = null;
										}
										this.features[ featureId ].estimate += record.raw.PlanEstimate;
										this.totalPoints += record.raw.PlanEstimate;
									}
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
	
	loadFeatures: function( index ) {
		var keys = Object.keys( this.features );
		
		if ( index >= keys.length ) {
			this.loadInitiatives( 0 );
		} else {
			// Set a global scope as the Feature may be in another project
			var dataScope = {
				workspace: this.getContext().getWorkspaceRef(),
				project: null
			};
			
			var store = Ext.create(
				'Rally.data.wsapi.artifact.Store',
				{
					models: ['PortfolioItem/Feature'],
					fetch: ['ObjectID', 'Parent'],
					filters: [
						{
							property: 'ObjectID',
							value: keys[ index ]
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
								if ( record.raw.Parent) {
									var featureId = record.raw.ObjectID;
									var initiativeId = record.raw.Parent.ObjectID;
									if( !( initiativeId in this.initiatives ) ) {
										this.initiatives[ initiativeId ] = {};
										this.initiatives[ initiativeId ].estimate = 0;
										this.initiatives[ initiativeId ].customerPerceivedValue = null;
										this.initiatives[ initiativeId ].CAIntent = null;
									}
									
									this.features[ featureId ].initative = initiativeId;
									this.initiatives[ initiativeId ].estimate += this.features[ featureId ].estimate;
								}
							},this);
						}
					}	
					this.loadFeatures( index + 1 );
				}
			});
		}
	},
	
	loadInitiatives: function( index ) {
		var keys = Object.keys( this.initiatives );
		
		if ( index >= keys.length ) {
			console.log( this.initiatives );
		} else {
			// Set a global scope as the Feature may be in another project
			var dataScope = {
				workspace: this.getContext().getWorkspaceRef(),
				project: null
			};
			
			var store = Ext.create(
				'Rally.data.wsapi.artifact.Store',
				{
					models: ['PortfolioItem/Initiative'],
					fetch: ['ObjectID', 'c_CAIntent', 'c_CustomerPerceivedValue', 'FormattedID', 'Name', 'DisplayColor'],
					filters: [
						{
							property: 'ObjectID',
							value: keys[ index ]
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
								var initiativeId = record.raw.ObjectID;
								this.initiatives[ initiativeId ].name = record.raw.Name;
								this.initiatives[ initiativeId ].formattedId = record.raw.FormattedID;
								this.initiatives[ initiativeId ].displayColor = record.raw.DisplayColor;
								this.initiatives[ initiativeId ].CAIntent = record.raw.c_CAIntent;
								this.initiatives[ initiativeId ].customerPerceivedValue = record.raw.c_CustomerPerceivedValue;
							},this);
						}
					}	
					this.loadInitiatives( index + 1 );
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