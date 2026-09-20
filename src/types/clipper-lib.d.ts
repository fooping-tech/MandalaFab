// Minimal typings for clipper-lib 6.4.2 (JS port of Clipper 1).
// Only the parts MandalaFab uses are declared; extend when needed.
declare module "clipper-lib" {
  namespace ClipperLib {
  export class IntPoint {
    constructor(x?: number, y?: number);
    X: number;
    Y: number;
  }
  export type Path = IntPoint[];
  export type Paths = Path[];

  export enum ClipType { ctIntersection = 0, ctUnion = 1, ctDifference = 2, ctXor = 3 }
  export enum PolyType { ptSubject = 0, ptClip = 1 }
  export enum PolyFillType { pftEvenOdd = 0, pftNonZero = 1, pftPositive = 2, pftNegative = 3 }
  export enum JoinType { jtSquare = 0, jtRound = 1, jtMiter = 2 }
  export enum EndType { etOpenSquare = 0, etOpenRound = 1, etOpenButt = 2, etClosedLine = 3, etClosedPolygon = 4 }

  export class PolyNode {
    Contour(): Path;
    Childs(): PolyNode[];
    IsHole(): boolean;
    IsOpen: boolean;
    m_polygon: Path;
    m_Childs: PolyNode[];
    ChildCount(): number;
    GetNext(): PolyNode | null;
  }
  export class PolyTree extends PolyNode {
    Total(): number;
    GetFirst(): PolyNode | null;
    Clear(): void;
  }

  export class Clipper {
    constructor(initOptions?: number);
    StrictlySimple: boolean;
    ReverseSolution: boolean;
    PreserveCollinear: boolean;
    AddPath(path: Path, polyType: PolyType, closed: boolean): boolean;
    AddPaths(paths: Paths, polyType: PolyType, closed: boolean): boolean;
    Execute(clipType: ClipType, solution: Paths | PolyTree, subjFill?: PolyFillType, clipFill?: PolyFillType): boolean;
    Clear(): void;
    static Area(path: Path): number;
    static Orientation(path: Path): boolean;
    static PointInPolygon(pt: IntPoint, path: Path): number;
    static CleanPolygon(path: Path, distance?: number): Path;
    static CleanPolygons(paths: Paths, distance?: number): Paths;
    static SimplifyPolygon(path: Path, fillType?: PolyFillType): Paths;
    static SimplifyPolygons(paths: Paths, fillType?: PolyFillType): Paths;
    static ReversePaths(paths: Paths): void;
    static PolyTreeToPaths(tree: PolyTree): Paths;
    static ClosedPathsFromPolyTree(tree: PolyTree): Paths;
    static OpenPathsFromPolyTree(tree: PolyTree): Paths;
  }

  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    MiterLimit: number;
    ArcTolerance: number;
    AddPath(path: Path, joinType: JoinType, endType: EndType): void;
    AddPaths(paths: Paths, joinType: JoinType, endType: EndType): void;
    Execute(solution: Paths | PolyTree, delta: number): void;
    Clear(): void;
  }

  export namespace JS {
    function AreaOfPolygon(path: Path, scale?: number): number;
    function AreaOfPolygons(paths: Paths, scale?: number): number;
    function BoundsOfPath(path: Path, scale?: number): { left: number; top: number; right: number; bottom: number };
    function BoundsOfPaths(paths: Paths, scale?: number): { left: number; top: number; right: number; bottom: number };
    function Clean(paths: Paths, delta: number): Paths;
    function Lighten(paths: Paths, tolerance: number): Paths;
    function ScaleUpPaths(paths: Paths, scale: number): void;
    function ScaleDownPaths(paths: Paths, scale: number): void;
  }

  }
  export = ClipperLib;
}
