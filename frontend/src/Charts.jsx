// Gráficos leves em SVG puro (sem dependência externa) pro dashboard.

const CORES_STATUS = {
  pendente: '#fbbf24',
  confirmada: '#4ade80',
  descartada: '#f87171',
  invalida: '#f87171',
};

const ROTULO_STATUS = {
  pendente: 'Pendentes',
  confirmada: 'Confirmadas',
  descartada: 'Descartadas',
  invalida: 'Rejeitadas',
};

export function DonutStatus({ porStatus, tamanho = 150, espessura = 20 }) {
  const dados = (porStatus || [])
    .filter((s) => s.total > 0)
    .map((s) => ({
      chave: s.status,
      rotulo: ROTULO_STATUS[s.status] || s.status,
      valor: s.total,
      cor: CORES_STATUS[s.status] || '#6366f1',
    }));

  const total = dados.reduce((soma, d) => soma + d.valor, 0);
  const raio = (tamanho - espessura) / 2;
  const centro = tamanho / 2;
  const circunferencia = 2 * Math.PI * raio;
  let acumulado = 0;

  return (
    <div className="grafico-donut-wrapper">
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" aria-label="Empresas por status">
        <g transform={`rotate(-90 ${centro} ${centro})`}>
          {total === 0 ? (
            <circle cx={centro} cy={centro} r={raio} fill="none" stroke="var(--cor-borda)" strokeWidth={espessura} />
          ) : (
            dados.map((d) => {
              const comprimento = (d.valor / total) * circunferencia;
              const offset = -acumulado;
              acumulado += comprimento;
              return (
                <circle
                  key={d.chave}
                  cx={centro}
                  cy={centro}
                  r={raio}
                  fill="none"
                  stroke={d.cor}
                  strokeWidth={espessura}
                  strokeDasharray={`${comprimento} ${circunferencia - comprimento}`}
                  strokeDashoffset={offset}
                />
              );
            })
          )}
        </g>
        <text x={centro} y={centro - 4} textAnchor="middle" className="grafico-donut-total">{total}</text>
        <text x={centro} y={centro + 16} textAnchor="middle" className="grafico-donut-legenda-central">total</text>
      </svg>
      <ul className="grafico-legenda">
        {dados.map((d) => (
          <li key={d.chave}>
            <span className="grafico-legenda-cor" style={{ background: d.cor }} />
            {d.rotulo}: {d.valor}
          </li>
        ))}
        {dados.length === 0 && <li className="mensagem-vazia">Sem dados ainda.</li>}
      </ul>
    </div>
  );
}

export function BarrasFontes({ porFonte, rotularFonte }) {
  const maximo = Math.max(1, ...(porFonte || []).map((f) => f.total));

  if (!porFonte || porFonte.length === 0) {
    return <p className="mensagem-vazia">Sem dados ainda.</p>;
  }

  return (
    <div className="grafico-barras">
      {porFonte.map((f) => (
        <div key={f.fonte} className="grafico-barra-linha">
          <span className="grafico-barra-rotulo">{rotularFonte(f.fonte)}</span>
          <div className="grafico-barra-trilho">
            <div className="grafico-barra-preenchimento" style={{ width: `${(f.total / maximo) * 100}%` }} />
          </div>
          <span className="grafico-barra-valor">{f.total}</span>
        </div>
      ))}
    </div>
  );
}
