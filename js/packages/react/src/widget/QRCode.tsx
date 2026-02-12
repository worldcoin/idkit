import { memo, useMemo, type ReactElement } from "react";
import QRCodeUtil from "qrcode/lib/core/qrcode.js";

const generateMatrix = (data: string): Array<number[]> => {
  const arr = (
    QRCodeUtil as {
      create: (
        data: string,
        opts: { errorCorrectionLevel: string },
      ) => { modules: { data: Uint8Array } };
    }
  ).create(data, { errorCorrectionLevel: "M" }).modules.data;
  const sqrt = Math.sqrt(arr.length);

  return arr.reduce(
    (rows: Array<number[]>, key: number, index: number) => {
      if (index % sqrt === 0) rows.push([key]);
      else rows[rows.length - 1].push(key);
      return rows;
    },
    [] as Array<number[]>,
  );
};

type QRCodeProps = {
  data: string;
  size?: number;
};

function QRCodeInner({ data, size = 200 }: QRCodeProps): ReactElement {
  const dots = useMemo(() => {
    const elements: ReactElement[] = [];
    const matrix = generateMatrix(data);
    const cellSize = size / matrix.length;
    const qrList = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];

    qrList.forEach(({ x, y }) => {
      const x1 = (matrix.length - 7) * cellSize * x;
      const y1 = (matrix.length - 7) * cellSize * y;

      for (let i = 0; i < 3; i++) {
        elements.push(
          <rect
            fill="currentColor"
            x={x1 + cellSize * i}
            y={y1 + cellSize * i}
            key={`${i}-${x}-${y}`}
            width={cellSize * (7 - i * 2)}
            height={cellSize * (7 - i * 2)}
            rx={(i - 2) * -5}
            ry={(i - 2) * -5}
            className={
              i % 3 === 0
                ? "qr-finder-dark"
                : i % 3 === 1
                  ? "qr-finder-light"
                  : "qr-finder-dark"
            }
          />,
        );
      }
    });

    matrix.forEach((row, i) => {
      row.forEach((_, j) => {
        if (!matrix[i][j]) return;
        if (
          (i < 7 && j < 7) ||
          (i > matrix.length - 8 && j < 7) ||
          (i < 7 && j > matrix.length - 8)
        )
          return;

        elements.push(
          <circle
            fill="currentColor"
            r={cellSize / 2.2}
            key={`circle-${i}-${j}`}
            cx={i * cellSize + cellSize / 2}
            cy={j * cellSize + cellSize / 2}
            className="qr-dot"
          />,
        );
      });
    });

    return elements;
  }, [size, data]);

  return (
    <svg height={size} width={size} data-test-id="qr-code">
      {dots}
    </svg>
  );
}

export const QRCode = memo(QRCodeInner);
