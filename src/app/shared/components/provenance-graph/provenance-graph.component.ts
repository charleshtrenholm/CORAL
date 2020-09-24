import { Component, OnInit, ElementRef, ViewChild, EventEmitter, Output, OnDestroy } from '@angular/core';
import { Network, DataSet, Node, Edge, NodeChosen, BoundingBox, IdType } from 'vis-network/standalone';
import { QueryMatch, Process } from 'src/app/shared/models/QueryBuilder';
import { partition } from 'lodash';
import { HomeService } from 'src/app/shared/services/home.service';
import { NgxSpinnerService } from 'ngx-spinner';
import { Subscription } from 'rxjs';
import { ResizeEvent } from 'angular-resizable-element';
@Component({
  selector: 'app-provenance-graph',
  templateUrl: './provenance-graph.component.html',
  styleUrls: ['./provenance-graph.component.css']
})
export class ProvenanceGraphComponent implements OnInit, OnDestroy {

  nodes:  DataSet<any>;
  edges: DataSet<any>;
  clusterNodes: any[] = []; // TODO: make models for response JSON
  @Output() querySelected: EventEmitter<{query: QueryMatch, process?: Process}> = new EventEmitter();

  provenanceLoadingSub: Subscription;
  provenanceGraphSub: Subscription;
  noResults = false;
  isDragging = false;
  resizeWidth = 0;
  canvasWidth = 0;
  canvasHeight = 0;
  fitAllNodesOnScreen = true;

  @ViewChild('pGraph') pGraph: ElementRef;

  options = {
    interaction: {
      zoomView: false,
      dragView: true,
      hover: true,
    },
    autoResize: false,
    physics: false,
    layout: {
      randomSeed: '0:0'
    },
  };

  coreTypeNodes: any[];
  dynamicTypeNodes: any[];

  network: Network;
  xScale: number;
  yScale: number;

  height: number;
  width: number;
  /* 
    VisJS zoom scales from 0 to 1, 0 being infinitely zoomed out, 1 being infinitely zoomed in.
    MIN_ZOOM_LIMIT is the most a graph can be zoomed out before the text in the nodes become 
    hard to read. This is to handle the possibility of very large graphs
  */
  readonly MIN_ZOOM_LIMIT = 0.6;

  constructor(
    private homeService: HomeService,
    private spinner: NgxSpinnerService,
  ) { }

  ngOnInit(): void {
    this.spinner.show('pgraph-loading');
    this.provenanceLoadingSub = this.homeService.getProvenanceLoadingSub()
    .subscribe(() => {
      this.noResults = false;
      this.network.destroy();
      this.spinner.show('pgraph-loading');
    });
    this.provenanceGraphSub = this.homeService.getProvenanceGraphSub()
      .subscribe((data: any) => {
        this.spinner.hide('pgraph-loading');
        this.initNetworkGraph(data.results);
      });
  }

  calculateScale(nodes, edges) {
    const el = this.pGraph.nativeElement.parentElement;
    this.canvasWidth = el.scrollWidth + this.resizeWidth;
    this.canvasHeight = el.scrollHeight;

    const xSort = nodes.filter(d => !d.parent).map(d => d.x).sort((a, b) => a - b);
    const ySort = nodes.filter(d => !d.parent).map(d => d.y).sort((a, b) => a - b);

    const xRange = xSort.pop() - xSort[0];
    const yRange = ySort.pop() - ySort[0];

    if (xRange < this.canvasWidth && yRange < this.canvasHeight) {
      let maxDistanceX = 0;
      let maxDistanceY = 0;
      edges.forEach(edge => {
        const sourceNode = nodes.find(node => node.index === edge.source);
        const targetNode = nodes.find(node => node.index === edge.target);
        const xDistance = Math.abs(targetNode.x - sourceNode.x);
        const yDistance = Math.abs(targetNode.y - sourceNode.y);
        if (xDistance > maxDistanceX) {
          maxDistanceX = xDistance;
        }
        if (yDistance > maxDistanceY) {
          maxDistanceY = yDistance;
        }
      });

      if (maxDistanceX !== 0 && (200 / maxDistanceX) * xRange < this.canvasWidth + 100) {
        this.xScale = 200 / maxDistanceX;
      } else {
        this.xScale = maxDistanceX === 0 ? 1 : this.canvasWidth / xRange;
      }

      if (maxDistanceY !== 0 && (100 / maxDistanceY) * yRange < this.canvasHeight + 100) {
        this.yScale = 100 / maxDistanceY;
      } else {
        this.yScale = maxDistanceY === 0 ? 1 : this.canvasWidth / yRange;
      }

    } else {

      const zoomLevelWithPadding = Math.min(this.canvasWidth / (xRange * 1.1), this.canvasHeight / (yRange * 1.1));
      if (zoomLevelWithPadding < this.MIN_ZOOM_LIMIT) {
        this.xScale = 1;
        this.yScale = 1;
      } else {
        this.xScale = this.canvasWidth / xRange;
        this.yScale = this.canvasHeight / yRange;
      }
    }
  }

  ngOnDestroy() {
    if (this.provenanceLoadingSub) {
      this.provenanceLoadingSub.unsubscribe();
    }
    if (this.provenanceGraphSub) {
      this.provenanceGraphSub.unsubscribe();
    }
  }

  initNetworkGraph(data) {
    this.calculateScale(data.nodes, data.links);
    const [coreTypes, dynamicTypes] = partition(data.nodes, node => node.category !== 'DDT_');

    if (!coreTypes.length && !dynamicTypes.length) {
      this.noResults = true;
      return;
    }
    // initialize core type nodes with x y coordinates
    this.nodes = new DataSet(coreTypes.map(node => this.createNode(node)));

    // layout dynamic types with visJS physics engine
    dynamicTypes.forEach(dynamicType => {
      if (dynamicType.isParent) {
        this.clusterNodes.push(dynamicType);
      }
      this.nodes.update(this.createNode(dynamicType));
    });

    // initialize edges
    this.edges = new DataSet(
      data.links.map(edge => this.createEdge(edge))
    );

    // render network
    this.network = new Network(
      this.pGraph.nativeElement,
      {
        nodes: this.nodes,
        edges: this.edges
      },
      this.options
    );

    // cluster nodes from clusterNodes array
    this.clusterNodes.forEach(clusterNode => this.addCluster(clusterNode));

    // add double click event listener to submit search query on nodes
    this.network.on('doubleClick', ({nodes}) => this.submitSearchQuery(nodes));

    // add click event to expand cluster nodes
    this.network.on('release', ({nodes}) => {
      if (!this.isDragging) {
        // if the id in nodes is a string and starts with cluster, open network cluster from id
        if (typeof nodes[0] === 'string' && nodes[0].includes('cluster')) {
          this.network.openCluster(nodes[0], {
            releaseFunction: (_ ,positions) => positions
          });
        }
        // logic to handle closing clusters
        const clusteredNode = this.clusterNodes.find(node => node.index === nodes[0]);
        if (clusteredNode) {
          this.reclusterNode(nodes[0]);
          // refit network to include everything exept hidden nodes
          this.network.fit({
            nodes: this.nodes.getIds({
              // this filter method returns items that DO get filtered out, the opposite of Array.prototype.filter :(
              filter: node => node.cid === clusteredNode.id
            }) as string[],
            animation: true
          })
        // if node is null then we have a cluster, expand to fit newly drawn cluster nodes
        } else if (this.nodes.get(nodes[0]) === null) {
          this.network.fit({
            nodes: this.nodes.map(node => node.id),
            animation: true
          })
        }
      }
      this.recalculateClusterPositions(nodes[0]);
    });

    // opening and closing of nodes will not fire is isDragging is true
    this.network.on('dragStart', () => this.isDragging = true);
    this.network.on('dragEnd', () => setTimeout(() => this.isDragging = false, 500));

    // show edge labels on hover
    this.network.on('hoverEdge', ({edge}) => {
      this.network.updateEdge(edge, {font: {color: 'black', strokeColor: 'white'}}); // vadjust
    });

    // hide edge labels on hover leave 
    this.network.on('blurEdge', ({edge}) => {
      this.network.updateEdge(edge, {font: {color: 'rgba(0,0,0,0)', strokeColor: 'rgba(0,0,0,0)'}});
    });

    // disable physics after nodes without coordinates have been pushed apart
    this.network.stabilize();

    this.network.on('stabilizationIterationsDone', () => {
      this.nodes.forEach(node => {
        this.nodes.update({id: node.id, fixed: false});
      });
      const zoom = this.network.getScale();

      if (zoom < this.MIN_ZOOM_LIMIT) {
        const rootBoundingBox = this.network.getBoundingBox((data.nodes.find(node => node.root)).index);
        this.network.fit({
          nodes: this.nodes.map(node => node.id).filter(id => {
            const boundingBox = this.network.getBoundingBox(id);
            if (
              boundingBox.top > rootBoundingBox.top + this.canvasHeight ||
              boundingBox.left > rootBoundingBox.left + this.canvasWidth ||
              boundingBox.top < rootBoundingBox.top ||
              boundingBox.left < rootBoundingBox.left
            ){
              return false
            }
            return true;
          }),
          animation: false
        });
      }
    });

}

addCluster(data) {
   // configuration for nodes that hold clusters together
   this.network.cluster({
    joinCondition: node => (node.cid && node.cid === data.index) || node.id === data.index,
    clusterNodeProperties: {
      label: `${data.count} ${data.name} [+]`,
      physics: false,
      color: {
        border: data.category === 'DDT_' ? 'rgb(246, 139, 98)' : 'rgb(78, 111, 182)',
        background: 'white'
      },
      borderWidth: 3,
      shape: 'box',
      shapeProperties: {
        borderRadius: 0
      },
      x: data.x * this.xScale,
      y: data.y * this.yScale,
      font: {
        size: 16,
        face: 'Red Hat Text, sans-serif'
      },
    },
   });
}

reclusterNode(nodeID) {
  const cluster = this.clusterNodes.find(item => item.index === nodeID);
  this.addCluster(cluster);
}

recalculateClusterPositions(nodeId: string | number) {
  // whenever we move the root cluster node we want the children to move with it
  if (this.network.isCluster(nodeId)) {
    // get new X Y coordinates
    const {x, y} = this.network.getPositions(nodeId)[nodeId];
    // get child nodes from cluster ID
    const childNodes = this.network
      .getNodesInCluster(nodeId)
      .map(childNodeId => this.nodes.get(childNodeId));
    // 'root' node is different from cluster node, we can use it to determine the original X Y coordinates before node was moved
    const rootNode = childNodes.find(node => node.data.isParent);

    const dx = x - rootNode.x;
    const dy = y - rootNode.y;
    // update positions for each node
    childNodes.forEach(({id, x, y}) => {
      this.nodes.update({id, x: x + dx, y: y + dy});
    });
    // also have to update coordinate deltas for stored cluster items when node collapses again
    const clustered = this.clusterNodes.find(node => node.index === rootNode.id);
    // divide by scale because item is added before network is rendered and scaling is multiplied
    clustered.x += (dx / this.xScale);
    clustered.y += (dy / this.yScale);
  }
}

createNode(dataItem: any): Node {
    const node: any = {
      id: dataItem.index,
      font: {
        size: 16,
        face: 'Red Hat Text, sans-serif'
      },
      color: {
        background: dataItem.category !== false ? 'white' : 'rgba(0,0,0,0)',
        border: dataItem.category === 'DDT_' ? 'rgb(246, 139, 98)' : 'rgb(78, 111, 182)',
        hover: { background: '#ddd' }
      },
      cid: dataItem.cid,
      shape: 'box',
      shapeProperties: {
        borderRadius: dataItem.category === 'DDT_' ? 0 : 20
      },
      data: {...dataItem},
      fixed: true,
      x: dataItem.x * this.xScale,
      y: dataItem.y * this.yScale,
    };

    if (dataItem.root) {
      node.borderWidth = 4;
      node.margin = 10;
      node.color.border = 'darkgreen';
    } else if (!dataItem.category) {
      node.borderWidth = 0;
    }

    if (dataItem.category) {
      node.label = `${dataItem.count} ${dataItem.name.replace(/<br>/g, '\n')}`;
    }

    if(dataItem.parent) {
      node.cid = dataItem.parent;
    }

    if (dataItem.isParent) {
      node.label = '[-]';
    }

    return node;
  }

  createEdge(edge): any {
    const toId = edge.target;
    const fromId = edge.source;
    const target: any = this.nodes.get(toId);
    return {
      from: target.cid ? target.cid : fromId,
      to: toId,
      width: edge.thickness,
      physics: false,
      label: edge.text.replace(/<br>/g, '\n').replace(/&rarr;/g, ' → '), // TODO: implement safeHtmlParser
      color: edge.in_filter ? 'blue' : '#777',
      selfReference: {
        angle: 0.22
      },
      font: {
        // hide labels initially
        size: 16,
        color: 'rgba(0,0,0,0)',
        strokeColor: 'rgba(0,0,0,0)',
      },
      arrows: {
        to: {
          // hide arrows for 'connector' nodes
          enabled: target && target.data.category !== false
        }
      },
      smooth: {
        enabled: edge.reversible === true,
        roundness: 0.2,
        forceDirection: 'vertical',
        type: 'curvedCW'
      },
    }
 }

  submitSearchQuery(nodes) {
    if (nodes.length) {
      const node = this.nodes.get(nodes)[0]
      if (!node.data.isParent) { // dont submit search for root cluster nodes
        const { category, dataType, dataModel } = node.data;
        const process: Process = this.getInputProcesses(node.id);
        const query = new QueryMatch({category, dataType, dataModel});
        if (category === 'DDT_') {
          this.querySelected.emit({query, process});
        } else {
        this.querySelected.emit({query});
        }
      }
    }
  }

  getInputProcesses(nodeId): Process {
    const targetNode = this.nodes.get(nodeId) as any;
    const [sourceNodeId] = this.network.getConnectedNodes(nodeId, 'from') as IdType[];
    const sourceNode = this.nodes.get(sourceNodeId) as any;

    if (!sourceNode.data.category || sourceNode.data.isParent) {
      // if node is a cluster or a connecter then we get the next parent node
      const [nextSourceId] = this.network.getConnectedNodes(sourceNode.id, 'from') as IdType[];
      const {category, dataType} = (this.nodes.get(nextSourceId) as any).data;
      if (sourceNode.data.isParent) {
        return new Process(
          [category + dataType],
          [targetNode.data.category + targetNode.data.dataType]
        );
      } else {
        // node is a connector and we need all of the children
        const childNodeIds = this.network.getConnectedNodes(sourceNode.id, 'to') as IdType[];
        return new Process(
          [category + dataType],
          childNodeIds.map(childNodeId => {
            const childNode = this.nodes.get(childNodeId) as any;
            return childNode.data.category + childNode.data.dataType;
          })
        );
      }
    } else {
      // case simple node to node case
      return new Process(
        [sourceNode.data.category + sourceNode.data.dataType],
        [targetNode.data.category + targetNode.data.dataType]
      );
    }
  }

  onResizeEnd(event) {
    this.resizeWidth += event.edges.right;
  }
}
