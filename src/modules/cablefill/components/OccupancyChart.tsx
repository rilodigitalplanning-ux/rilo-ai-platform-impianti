import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { ProjectCable, Translation } from '../types';

interface OccupancyChartProps {
  projectCables: ProjectCable[];
  t: Translation;
}

export const OccupancyChart: React.FC<OccupancyChartProps> = ({ projectCables, t }) => {
  const data = React.useMemo(() => {
    const areas = {
      power: 0,
      data: 0,
      evac: 0,
      irai: 0,
    };

    projectCables.forEach(pc => {
      if (!pc.cable) return;
      const area = Math.PI * Math.pow(pc.cable.diameter / 2, 2) * pc.quantity;
      areas[pc.cable.type] += area;
    });

    return [
      { name: t.cableTypes.power, value: areas.power, color: '#E63946' },
      { name: t.cableTypes.data, value: areas.data, color: '#00B4D8' },
      { name: t.cableTypes.evac, value: areas.evac, color: '#F4A261' },
      { name: t.cableTypes.irai, value: areas.irai, color: '#2A9D8F' },
    ].filter(item => item.value > 0);
  }, [projectCables, t]);

  if (data.length === 0) return null;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
