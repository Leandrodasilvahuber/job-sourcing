export function Abas({ aba, onChange, itens }) {
  return (
    <div className="abas">
      {itens.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`aba-botao ${aba === item.id ? 'aba-ativa' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
