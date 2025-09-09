import React, { useEffect, useRef, useState } from 'react';
import { GameCommand, LevelConfig } from '../types';
import './BlueprintGraph.css';

interface BlueprintNode {
  id: string;
  type: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  inputs: ConnectionPoint[];
  outputs: ConnectionPoint[];
  command: GameCommand;
  color: string;
}

interface ConnectionPoint {
  id: string;
  type: 'input' | 'output';
  x: number;
  y: number;
  connectedTo?: string;
}

interface BlueprintGraphProps {
  level: LevelConfig;
  isOpen: boolean;
  onClose: () => void;
}

const BlueprintGraph: React.FC<BlueprintGraphProps> = ({ level, isOpen, onClose }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<BlueprintNode[]>([]);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 获取节点颜色
  const getNodeColor = (commandType: string): string => {
    const colors: { [key: string]: string } = {
      'SHOW_IMAGE': '#4CAF50',
      'SHOW_TEXT': '#2196F3',
      'SHOW_BUTTON': '#FF9800',
      'SET_VARIABLE': '#9C27B0',
      'SET_SWITCH': '#795548',
      'IF_CONDITION': '#F44336',
      'WAIT': '#607D8B',
      'MOVE_TO': '#00BCD4',
      'SHOW_CHOICES': '#E91E63',
      'EVENT_GROUP': '#3F51B5'
    };
    return colors[commandType] || '#757575';
  };

  // 获取节点标题
  const getNodeTitle = (command: GameCommand): string => {
    const titles: { [key: string]: string } = {
      'SHOW_IMAGE': '显示图片',
      'SHOW_TEXT': '显示文本',
      'SHOW_BUTTON': '显示按钮',
      'SET_VARIABLE': '设置变量',
      'SET_SWITCH': '设置开关',
      'IF_CONDITION': '条件判断',
      'WAIT': '等待',
      'MOVE_TO': '移动',
      'SHOW_CHOICES': '显示选项',
      'EVENT_GROUP': '事件组'
    };
    return titles[command.type] || command.type;
  };

  // 转换指令为蓝图节点
  const convertCommandsToNodes = (commands: GameCommand[], startX: number, startY: number, isMainFlow: boolean = false, isHorizontal: boolean = false): BlueprintNode[] => {
    const nodes: BlueprintNode[] = [];
    let xOffset = startX;
    let yOffset = startY;
    
    commands.forEach((cmd, index) => {
      const width = 160;
      const height = 50; // 降低高度
      
      const node: BlueprintNode = {
        id: cmd.id,
        type: cmd.type,
        title: getNodeTitle(cmd),
        x: isHorizontal ? xOffset : startX,
        y: isHorizontal ? startY : yOffset,
        width,
        height,
        command: cmd,
        color: getNodeColor(cmd.type),
        inputs: [
          {
            id: `${cmd.id}_input`,
            type: 'input',
            x: 0,
            y: height / 2
          }
        ],
        outputs: [
          {
            id: `${cmd.id}_output`,
            type: 'output',
            x: width,
            y: height / 2
          }
        ]
      };
      
      nodes.push(node);
      
      // 处理子节点（条件分支）
      if (cmd.children && cmd.children.length > 0) {
        const childOffsetX = isMainFlow ? 180 : -180;
        const childNodes = convertCommandsToNodes(cmd.children, startX + childOffsetX, isHorizontal ? yOffset + 80 : yOffset, false, true); // 子节点垂直排列
        nodes.push(...childNodes);
      }
      
      // 根据布局方向调整位置
      if (isHorizontal) {
        xOffset += width + 40; // 水平排列
      } else {
        yOffset += height + 20; // 垂直排列
      }
    });
    
    return nodes;
  };

  // 处理事件数据
  const processEvents = (mainFlowCenterX: number, mainFlowCenterY: number): BlueprintNode[] => {
    const eventNodes: BlueprintNode[] = [];
    const levelData = level as any;
    
    if (levelData.events && Array.isArray(levelData.events)) {
      const eventCount = levelData.events.length;
      const radius = 400; // 事件距离中心点的半径
      const angleStep = (2 * Math.PI) / eventCount;
      
      levelData.events.forEach((event: any, eventIndex: number) => {
        const angle = eventIndex * angleStep;
        const eventX = mainFlowCenterX + Math.cos(angle) * radius - 100; // -100 为节点宽度的一半
        const eventY = mainFlowCenterY + Math.sin(angle) * radius - 30;  // -30 为节点高度的一半
        
        const eventNode: BlueprintNode = {
          id: event.id,
          type: 'EVENT_GROUP',
          title: `事件: ${event.name || '未命名'}`,
          x: eventX,
          y: eventY,
          width: 200,
          height: 60,
          command: {
            id: event.id,
            type: 'EVENT_GROUP' as any,
            parameters: { name: event.name },
            enabled: true,
            description: `事件: ${event.name || '未命名'}`
          },
          color: getNodeColor('EVENT_GROUP'),
          inputs: [
            {
              id: `${event.id}_input`,
              type: 'input',
              x: 0,
              y: 30
            }
          ],
          outputs: [
            {
              id: `${event.id}_output`,
              type: 'output',
              x: 200,
              y: 30
            }
          ]
        };
        
        eventNodes.push(eventNode);
        
        // 处理事件中的指令，在事件节点周围呈扇形分布
        if (event.commands && Array.isArray(event.commands)) {
          const commandCount = event.commands.length;
          const commandRadius = 150;
          const commandAngleStart = angle - Math.PI / 6; // 扇形起始角度
          const commandAngleStep = Math.PI / 3 / (commandCount + 1); // 扇形角度步长
          
          event.commands.forEach((cmd: any, cmdIndex: number) => {
            const cmdAngle = commandAngleStart + (cmdIndex + 1) * commandAngleStep;
            const cmdX = eventX + Math.cos(cmdAngle) * commandRadius;
            const cmdY = eventY + Math.sin(cmdAngle) * commandRadius;
            
            const commandNode: BlueprintNode = {
              id: cmd.id,
              type: cmd.type.toUpperCase() as any,
              title: getNodeTitle({
                ...cmd,
                type: cmd.type.toUpperCase() as any
              }),
              x: cmdX,
              y: cmdY,
              width: 140,
              height: 40, // 降低高度
              command: {
                ...cmd,
                type: cmd.type.toUpperCase() as any
              },
              color: getNodeColor(cmd.type.toUpperCase()),
              inputs: [
                {
                  id: `${cmd.id}_input`,
                  type: 'input',
                  x: 0,
                  y: 20
                }
              ],
              outputs: [
                {
                  id: `${cmd.id}_output`,
                  type: 'output',
                  x: 140,
                  y: 20
                }
              ]
            };
            
            eventNodes.push(commandNode);
          });
        }
      });
    }
    
    return eventNodes;
  };

  // 初始化节点
  useEffect(() => {
    if (!isOpen) return;
    
    // 计算主流程的中心位置
    const centerX = 600; // SVG 画布中心 X
    const centerY = 400; // SVG 画布中心 Y
    
    // 主流程水平居中排列
    const totalWidth = level.commands.length * 200; // 每个节点宽度+间距
    const mainFlowStartX = centerX - totalWidth / 2; // 水平居中
    const mainFlowStartY = centerY; // 垂直居中
    
    const commandNodes = convertCommandsToNodes(level.commands, mainFlowStartX, mainFlowStartY, true, true); // 水平排列
    const eventNodes = processEvents(centerX, centerY);
    const allNodes = [...commandNodes, ...eventNodes];
    
    setNodes(allNodes);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [level, isOpen]);

  // 处理鼠标滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.1, Math.min(3, prev * delta)));
  };

  // 处理拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (!isOpen) return null;

  return (
    <div className="blueprint-graph-overlay">
      <div className="blueprint-graph-header">
        <h3>游戏逻辑蓝图 - {level.name}</h3>
        <button className="close-button" onClick={onClose}>×</button>
      </div>
      <div 
        className="blueprint-graph-container"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg 
          ref={svgRef}
          width="100%" 
          height="100%"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale})`}>
            {/* 绘制连接线 */}
            {(() => {
              const lines: JSX.Element[] = [];
              
              // 1. 绘制主流程内部的连接线
              const mainFlowNodes = nodes.filter(node => 
                node.type !== 'EVENT_GROUP' && 
                Math.abs(node.y - 400) < 50 && // 水平中心线附近
                node.x > 200 && node.x < 1000 // 水平范围
              ).sort((a, b) => a.x - b.x); // 按X坐标排序
              
              for (let i = 0; i < mainFlowNodes.length - 1; i++) {
                const currentNode = mainFlowNodes[i];
                const nextNode = mainFlowNodes[i + 1];
                
                if (currentNode.outputs.length > 0 && nextNode.inputs.length > 0) {
                  lines.push(
                    <line
                      key={`mainflow_${currentNode.id}_${nextNode.id}`}
                      x1={currentNode.x + currentNode.outputs[0].x}
                      y1={currentNode.y + currentNode.outputs[0].y}
                      x2={nextNode.x + nextNode.inputs[0].x}
                      y2={nextNode.y + nextNode.inputs[0].y}
                      stroke="#4CAF50"
                      strokeWidth="3"
                      markerEnd="url(#arrowhead)"
                      opacity="0.8"
                    />
                  );
                }
              }
              
              // 2. 绘制事件到主流程的连接线
              const eventNodes = nodes.filter(node => node.type === 'EVENT_GROUP');
              const mainFlowCenter = { x: 600, y: 400 };
              
              eventNodes.forEach(eventNode => {
                // 连接事件到主流程中心
                lines.push(
                  <line
                    key={`event_to_center_${eventNode.id}`}
                    x1={eventNode.x + eventNode.outputs[0].x}
                    y1={eventNode.y + eventNode.outputs[0].y}
                    x2={mainFlowCenter.x}
                    y2={mainFlowCenter.y}
                    stroke="#2196F3"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    markerEnd="url(#arrowhead)"
                    opacity="0.6"
                  />
                );
              });
              
              // 3. 绘制事件内部指令的连接线
              eventNodes.forEach(eventNode => {
                const eventCommands = nodes.filter(node => 
                  node.type !== 'EVENT_GROUP' && 
                  Math.abs(node.x - eventNode.x) < 300 && 
                  Math.abs(node.y - eventNode.y) < 300
                ).sort((a, b) => a.x - b.x); // 按X坐标排序，因为是水平排列
                
                for (let i = 0; i < eventCommands.length - 1; i++) {
                  const currentCmd = eventCommands[i];
                  const nextCmd = eventCommands[i + 1];
                  
                  if (currentCmd.outputs.length > 0 && nextCmd.inputs.length > 0) {
                    lines.push(
                      <line
                        key={`event_cmd_${currentCmd.id}_${nextCmd.id}`}
                        x1={currentCmd.x + currentCmd.outputs[0].x}
                        y1={currentCmd.y + currentCmd.outputs[0].y}
                        x2={nextCmd.x + nextCmd.inputs[0].x}
                        y2={nextCmd.y + nextCmd.inputs[0].y}
                        stroke="#FF9800"
                        strokeWidth="2"
                        markerEnd="url(#arrowhead)"
                        opacity="0.7"
                      />
                    );
                  }
                }
              });
              
              // 4. 绘制条件分支的连接线
              nodes.forEach(node => {
                if (node.children && node.children.length > 0) {
                  node.children.forEach(child => {
                    lines.push(
                      <line
                        key={`branch_${node.id}_${child.id}`}
                        x1={node.x + node.width}
                        y1={node.y + node.height / 2}
                        x2={child.x}
                        y2={child.y + child.height / 2}
                        stroke="#F44336"
                        strokeWidth="2"
                        markerEnd="url(#arrowhead)"
                        opacity="0.7"
                      />
                    );
                  });
                }
              });
              
              return lines;
            })()}
            
            {/* 绘制节点 */}
            {nodes.map((node) => (
              <g key={node.id}>
                {/* 节点背景 */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={node.type === 'EVENT_GROUP' ? "12" : "8"}
                  fill={node.color}
                  stroke={node.type === 'EVENT_GROUP' ? "#fff" : "#333"}
                  strokeWidth={node.type === 'EVENT_GROUP' ? "3" : "2"}
                  opacity="0.9"
                  filter={node.type === 'EVENT_GROUP' ? "url(#glow)" : "none"}
                />
                
                {/* 节点标题 */}
                <text
                  x={node.x + node.width / 2}
                  y={node.y + 18}
                  textAnchor="middle"
                  fill="white"
                  fontSize={node.type === 'EVENT_GROUP' ? "12" : "10"}
                  fontWeight="bold"
                >
                  {node.title}
                </text>
                
                {/* 节点描述（仅对事件节点显示） */}
                {node.type === 'EVENT_GROUP' && (
                  <text
                    x={node.x + node.width / 2}
                    y={node.y + 40}
                    textAnchor="middle"
                    fill="white"
                    fontSize="9"
                    opacity="0.8"
                  >
                    {node.command.description || ''}
                  </text>
                )}
                
                {/* 输入连接点 */}
                {node.inputs.map((input) => (
                  <circle
                    key={input.id}
                    cx={node.x + input.x}
                    cy={node.y + (node.type === 'EVENT_GROUP' ? 30 : 25)}
                    r={node.type === 'EVENT_GROUP' ? "8" : "5"}
                    fill="#4CAF50"
                    stroke="white"
                    strokeWidth="2"
                  />
                ))}
                
                {/* 输出连接点 */}
                {node.outputs.map((output) => (
                  <circle
                    key={output.id}
                    cx={node.x + output.x}
                    cy={node.y + (node.type === 'EVENT_GROUP' ? 30 : 25)}
                    r={node.type === 'EVENT_GROUP' ? "8" : "5"}
                    fill="#F44336"
                    stroke="white"
                    strokeWidth="2"
                  />
                ))}
              </g>
            ))}
            
            {/* 箭头标记 */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3.5, 0 7"
                  fill="#666"
                />
              </marker>
              
              {/* 事件节点发光效果 */}
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge> 
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
          </g>
        </svg>
      </div>
      <div className="blueprint-graph-controls">
        <span>缩放: {(scale * 100).toFixed(0)}%</span>
        <span>鼠标滚轮缩放 | 中键拖拽 | 主流程:水平排列 | 事件:扇形分布</span>
      </div>
    </div>
  );
};

export default BlueprintGraph;