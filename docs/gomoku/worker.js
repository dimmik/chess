// Фоновый «мозг»: ход компьютера и проверки задач решателем, чтобы страница не подвисала.
importScripts('gomoku.js', 'ai.js', 'brain.js');
self.onmessage = (e) => {
  const { id, cmd, data } = e.data;
  let result = null, error = null;
  try { result = self.GomokuBrain[cmd](data); } catch (err) { error = String(err); }
  self.postMessage({ id, result, error });
};
