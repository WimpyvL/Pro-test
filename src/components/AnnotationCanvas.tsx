import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line, Arrow, Rect, Text as KonvaText, Image as KonvaImage } from 'react-konva';
import { MousePointer2, Pencil, ArrowRight, Square, Type, Trash2, Check, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export type Tool = 'select' | 'pencil' | 'arrow' | 'rect' | 'text';

interface Shape {
  id: string;
  type: Tool;
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  color: string;
  fontSize?: number;
  fontStyle?: string;
  fontFamily?: string;
}

interface AnnotationCanvasProps {
  image: string;
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

export default function AnnotationCanvas({ image, onSave, onCancel }: AnnotationCanvasProps) {
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState('#ef4444');
  const [fontSize, setFontSize] = useState(24);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [isBold, setIsBold] = useState(true);
  const [isItalic, setIsItalic] = useState(false);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, scale: 1 });
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const img = new Image();
    img.src = image;
    img.onload = () => {
      setBgImage(img);
      calculateDimensions(img);
    };
  }, [image]);

  useEffect(() => {
    if (!bgImage) {
      return;
    }

    const handleResize = () => calculateDimensions(bgImage);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [bgImage]);

  const calculateDimensions = (img: HTMLImageElement) => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.offsetWidth - 32;
    const containerHeight = containerRef.current.offsetHeight - 100;
    
    const scale = Math.min(containerWidth / img.width, containerHeight / img.height, 1);
    setDimensions({
      width: img.width * scale,
      height: img.height * scale,
      scale
    });
  };

  const handleMouseDown = (e: any) => {
    if (tool === 'select') return;

    setIsDrawing(true);
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    
    // Adjust position for scale
    const x = pos.x / dimensions.scale;
    const y = pos.y / dimensions.scale;

    const newShape: Shape = {
      id: Date.now().toString(),
      type: tool,
      color,
      x,
      y,
      points: [x, y],
      width: 0,
      height: 0,
      text: tool === 'text' ? 'Type here...' : undefined,
      fontSize: tool === 'text' ? fontSize : undefined,
      fontFamily: tool === 'text' ? fontFamily : undefined,
      fontStyle: tool === 'text' ? `${isBold ? 'bold' : ''} ${isItalic ? 'italic' : ''}`.trim() || 'normal' : undefined,
    };

    if (tool === 'text') {
      setEditingId(newShape.id);
      setSelectedId(newShape.id);
      setIsDrawing(false);
    } else {
      setSelectedId(null);
    }

    setShapes([...shapes, newShape]);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing) return;

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const lastShape = shapes[shapes.length - 1];

    const x = pos.x / dimensions.scale;
    const y = pos.y / dimensions.scale;

    if (tool === 'pencil') {
      lastShape.points = lastShape.points!.concat([x, y]);
    } else if (tool === 'rect' || tool === 'arrow') {
      lastShape.width = x - lastShape.x!;
      lastShape.height = y - lastShape.y!;
    }

    setShapes([...shapes.slice(0, -1), lastShape]);
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const handleTextChange = (id: string, newText: string) => {
    setShapes(shapes.map(s => s.id === id ? { ...s, text: newText } : s));
  };

  // Update selected shape properties
  useEffect(() => {
    if (selectedId) {
      setShapes(prev => prev.map(s => {
        if (s.id === selectedId && s.type === 'text') {
          return {
            ...s,
            fontSize,
            fontFamily,
            fontStyle: `${isBold ? 'bold' : ''} ${isItalic ? 'italic' : ''}`.trim() || 'normal',
            color
          };
        }
        return s;
      }));
    }
  }, [fontSize, fontFamily, isBold, isItalic, color, selectedId]);

  const handleSave = () => {
    if (stageRef.current) {
      // Export at original resolution
      const dataUrl = stageRef.current.toDataURL({ pixelRatio: 1 / dimensions.scale });
      onSave(dataUrl);
    }
  };

  if (!bgImage) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-4 text-sm text-zinc-400">Loading editor...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onCancel} />
      <div ref={containerRef} className="relative flex h-[min(92vh,980px)] w-[min(96vw,1440px)] flex-col overflow-hidden rounded-[28px] border border-zinc-800 bg-zinc-950 shadow-2xl select-none touch-none">
        <div className="flex flex-col border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-xl">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-orange-400">Annotate Report</p>
              <p className="truncate text-xs text-zinc-500">The game stays mounted underneath this modal.</p>
            </div>
            <div className="ml-4 flex items-center gap-2">
              <button onClick={() => setShapes([])} className="p-2 text-zinc-500 active:text-white"><Trash2 size={18} /></button>
              <button onClick={onCancel} className="p-2 text-zinc-500 active:text-white"><X size={20} /></button>
              <button 
                onClick={handleSave}
                className="flex h-10 items-center justify-center rounded-full bg-orange-600 px-4 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-orange-900/40 transition-transform active:scale-90"
              >
                <Check size={18} className="mr-2" />
                Save
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-3 no-scrollbar">
            <ToolbarButton active={tool === 'pencil'} onClick={() => setTool('pencil')} icon={<Pencil size={18} />} />
            <ToolbarButton active={tool === 'arrow'} onClick={() => setTool('arrow')} icon={<ArrowRight size={18} />} />
            <ToolbarButton active={tool === 'rect'} onClick={() => setTool('rect')} icon={<Square size={18} />} />
            <ToolbarButton active={tool === 'text'} onClick={() => setTool('text')} icon={<Type size={18} />} />
            <div className="mx-1 h-6 w-px shrink-0 bg-zinc-800" />
            <div className="flex gap-1">
              {['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#ffffff'].map(c => (
                <button 
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition-transform active:scale-125",
                    color === c ? "scale-110 border-white" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {tool === 'text' && (
            <div className="flex items-center gap-4 overflow-x-auto border-t border-zinc-800/50 bg-black/20 px-6 py-2 no-scrollbar">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Font</span>
                <select 
                  value={fontFamily} 
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
                >
                  <option value="Inter">Sans</option>
                  <option value="Georgia">Serif</option>
                  <option value="JetBrains Mono">Mono</option>
                </select>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Size</span>
                <select 
                  value={fontSize} 
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
                >
                  {[12, 16, 20, 24, 32, 48, 64].map(size => (
                    <option key={size} value={size}>{size}px</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-1 shrink-0">
                <button 
                  onClick={() => setIsBold(!isBold)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded border text-xs font-bold transition-colors",
                    isBold ? "border-orange-600 bg-orange-600 text-white" : "border-zinc-700 bg-zinc-800 text-zinc-400"
                  )}
                >
                  B
                </button>
                <button 
                  onClick={() => setIsItalic(!isItalic)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded border text-xs italic transition-colors",
                    isItalic ? "border-orange-600 bg-orange-600 text-white" : "border-zinc-700 bg-zinc-800 text-zinc-400"
                  )}
                >
                  I
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(#27272a_1px,transparent_1px)] p-4 [background-size:20px_20px]">
          <div className="overflow-hidden rounded-lg border border-zinc-800 bg-black shadow-2xl">
            <Stage
              width={dimensions.width}
              height={dimensions.height}
              scaleX={dimensions.scale}
              scaleY={dimensions.scale}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseUp}
              ref={stageRef}
            >
              <Layer>
                <KonvaImage image={bgImage} />
                {shapes.map((shape) => {
                  if (shape.type === 'pencil') {
                    return <Line key={shape.id} points={shape.points} stroke={shape.color} strokeWidth={4} tension={0.5} lineCap="round" lineJoin="round" />;
                  }
                  if (shape.type === 'arrow') {
                    return <Arrow key={shape.id} points={[shape.x!, shape.y!, shape.x! + shape.width!, shape.y! + shape.height!]} stroke={shape.color} fill={shape.color} strokeWidth={4} pointerLength={10} pointerWidth={10} />;
                  }
                  if (shape.type === 'rect') {
                    return <Rect key={shape.id} x={shape.x} y={shape.y} width={shape.width} height={shape.height} stroke={shape.color} strokeWidth={4} />;
                  }
                  if (shape.type === 'text') {
                    const isSelected = selectedId === shape.id;
                    return (
                      <KonvaText 
                        key={shape.id} 
                        x={shape.x} 
                        y={shape.y} 
                        text={shape.text} 
                        fontSize={shape.fontSize || 24} 
                        fontFamily={shape.fontFamily || 'Inter'}
                        fill={shape.color} 
                        fontStyle={shape.fontStyle || 'bold'} 
                        stroke="black"
                        strokeWidth={0.5}
                        draggable 
                        onClick={(e) => {
                          e.cancelBubble = true;
                          setSelectedId(shape.id);
                          setEditingId(shape.id);
                        }}
                        onTap={(e) => {
                          e.cancelBubble = true;
                          setSelectedId(shape.id);
                          setEditingId(shape.id);
                        }}
                        onDragStart={() => setSelectedId(shape.id)}
                        shadowColor="black"
                        shadowBlur={2}
                        shadowOpacity={0.5}
                        opacity={isSelected ? 0.8 : 1}
                      />
                    );
                  }
                  return null;
                })}
              </Layer>
            </Stage>
          </div>
        </div>
      </div>

      {editingId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Edit Annotation</h3>
            <textarea
              autoFocus
              value={shapes.find(s => s.id === editingId)?.text || ''}
              onChange={(e) => handleTextChange(editingId, e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-white text-sm focus:ring-2 focus:ring-orange-600 outline-none min-h-[120px]"
              placeholder="Type your bug description..."
            />
            <div className="flex justify-end mt-4">
              <button 
                onClick={() => setEditingId(null)}
                className="px-6 py-2 bg-orange-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ active, onClick, icon }: { active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-2.5 rounded-xl transition-all active:scale-90",
        active ? "bg-orange-600 text-white shadow-lg shadow-orange-900/20" : "text-zinc-500 hover:text-zinc-300"
      )}
    >
      {icon}
    </button>
  );
}
