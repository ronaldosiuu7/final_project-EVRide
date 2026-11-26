import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../integrations/authBridge.jsx';
import useApiQuery from '../../hooks/useApiQuery.js';
import {
  getFaqSourceText,
  listFaqs,
  postFaqChatbotMessage,
} from '../../services/operationsApi.js';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  StatusBadge,
  TextField,
} from '../../components/ui/index.js';
import {
  ArrowRightIcon,
  ChevronDownIcon,
} from '../../components/customer/CustomerIcons.jsx';
import { getApiErrorMessage } from '../../utils/errorMessages.js';
import {
  filterFaqsByQuery,
  formatSafePlainSourceText,
} from '../../utils/supportHelpers.js';

function FaqSourceModal({ source, onClose }) {
  const sourceQuery = useApiQuery(
    ({ signal }) => getFaqSourceText(source.url, { signal }),
    [source?.url || ''],
    { enabled: Boolean(source?.url) }
  );

  const safeText = formatSafePlainSourceText(sourceQuery.data);

  return (
    <Modal
      open
      size="lg"
      title={source?.title || 'Tài liệu nguồn tham khảo'}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      <div className="stack-md">
        {sourceQuery.loading && <LoadingState message="Đang tải nội dung tài liệu nguồn..." />}

        {!sourceQuery.loading && sourceQuery.error && (
          <ErrorState
            error={sourceQuery.error}
            onRetry={sourceQuery.reload}
            title="Tài liệu nguồn tạm thời không khả dụng"
            hideCode
          />
        )}

        {!sourceQuery.loading && !sourceQuery.error && (
          <pre className="faq-source-pre">{safeText || 'Không có nội dung hiển thị.'}</pre>
        )}
      </div>
    </Modal>
  );
}

export default function CustomerFaqPage() {
  const { isAuthenticated, user } = useAuth();
  const isCustomer = isAuthenticated && user?.role === 'CUSTOMER';

  const [searchQuery, setSearchQuery] = useState('');
  const [openFaqId, setOpenFaqId] = useState(null);
  const [selectedSource, setSelectedSource] = useState(null);

  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [chatMessages, setChatMessages] = useState([]);

  const faqQuery = useApiQuery(({ signal }) => listFaqs({ signal }), []);

  const allFaqs = Array.isArray(faqQuery.data) ? faqQuery.data : [];
  const filteredFaqs = useMemo(
    () => filterFaqsByQuery(allFaqs, searchQuery),
    [allFaqs, searchQuery]
  );

  const handleSendChat = async (event) => {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    setChatLoading(true);
    setChatError('');
    setChatMessages((prev) => [...prev, { id: `u-${Date.now()}`, sender: 'user', text }]);
    setChatInput('');

    try {
      const { data } = await postFaqChatbotMessage(text);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          sender: 'bot',
          text: data?.reply || 'Hệ thống chưa tìm thấy câu trả lời phù hợp.',
          sources: Array.isArray(data?.sources) ? data.sources : [],
        },
      ]);
    } catch (err) {
      setChatError(getApiErrorMessage(err));
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="customer-page">
      <div className="customer-page-header">
        <div>
          <span className="customer-page-eyebrow">Trợ giúp &amp; Chính sách</span>
          <h1 className="customer-page-title">Câu hỏi thường gặp &amp; Trợ lý FAQ</h1>
          <p className="customer-page-subtitle">
            Tra cứu nhanh quy định giữ xe, pin tối thiểu, cách tính cước, tiền cọc và trả xe kèm tài liệu nguồn chính thức của EVRide.
          </p>
        </div>
        {isCustomer && (
          <Link to="/support" className="btn btn-sm btn-secondary">
            <span>Gửi yêu cầu hỗ trợ</span>
            <ArrowRightIcon size={15} />
          </Link>
        )}
      </div>

      <div className="faq-layout-grid">
        {/* Cột 1: Tìm kiếm + Accordion FAQ */}
        <section className="station-detail-panel" aria-labelledby="faq-list-heading">
          <div className="station-detail-top">
            <h2 id="faq-list-heading" className="customer-card-title">
              Danh mục câu hỏi thường gặp
            </h2>
            {!faqQuery.loading && !faqQuery.error && (
              <span className="customer-meta-label">
                Hiển thị {filteredFaqs.length} / {allFaqs.length} câu hỏi
              </span>
            )}
          </div>

          <TextField
            id="faq-search-input"
            label="Tìm nhanh câu hỏi"
            type="search"
            placeholder="Ví dụ: giữ xe, tiền cọc, pin, trả khác trạm..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {faqQuery.loading && <LoadingState message="Đang tải danh sách câu hỏi thường gặp..." />}

          {!faqQuery.loading && faqQuery.error && (
            <ErrorState
              error={faqQuery.error}
              onRetry={faqQuery.reload}
              title="Không tải được câu hỏi thường gặp"
              hideCode
            />
          )}

          {!faqQuery.loading && !faqQuery.error && filteredFaqs.length === 0 && (
            <EmptyState
              title="Không tìm thấy câu hỏi khớp từ khóa"
              hint="Hãy thử từ khóa ngắn hơn như giữ xe, pin, giá, cọc hoặc trả xe."
              action={
                searchQuery ? (
                  <Button size="sm" variant="secondary" onClick={() => setSearchQuery('')}>
                    Xóa từ khóa
                  </Button>
                ) : null
              }
            />
          )}

          {!faqQuery.loading && !faqQuery.error && filteredFaqs.length > 0 && (
            <div className="faq-accordion-list">
              {filteredFaqs.map((item) => {
                const isOpen = openFaqId === item.id;
                const sources = Array.isArray(item.sources) ? item.sources : [];
                return (
                  <article key={item.id} className={`faq-accordion-item ${isOpen ? 'is-open' : ''}`}>
                    <button
                      type="button"
                      className="faq-accordion-trigger"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                    >
                      <span>{item.question}</span>
                      <span aria-hidden="true" className="faq-accordion-icon">
                        <ChevronDownIcon size={18} />
                      </span>
                    </button>

                    {isOpen && (
                      <div className="faq-accordion-body">
                        <p>{item.answer}</p>
                        {sources.length > 0 && (
                          <div className="faq-sources-row">
                            <span className="customer-meta-label">Nguồn tham khảo:</span>
                            {sources.map((src, idx) => (
                              <button
                                key={`${item.id}-src-${idx}`}
                                type="button"
                                className="faq-source-link"
                                onClick={() => setSelectedSource(src)}
                              >
                                {src.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Cột 2: Trợ lý Chatbot FAQ */}
        <section className="station-detail-panel vehicle-booking-card" aria-labelledby="faq-chatbot-heading">
          <div className="station-detail-top">
            <div>
              <h2 id="faq-chatbot-heading" className="customer-card-title">
                Trợ lý giải đáp FAQ
              </h2>
              <p className="station-card-address" style={{ marginTop: 4 }}>
                Hỏi đáp nhanh theo tài liệu chính sách chính thức của EVRide (không thực hiện đặt xe hay giao dịch ví qua chat).
              </p>
            </div>
            <StatusBadge label="Chế độ FAQ" tone="info" />
          </div>

          {!isCustomer ? (
            <div className="alert alert-info stack-xs">
              <p>
                Trợ lý giải đáp FAQ dành cho tài khoản Khách hàng đã đăng nhập. Bạn vẫn có thể tra cứu toàn bộ câu hỏi thường gặp ở cột bên cạnh.
              </p>
              {!isAuthenticated && (
                <div>
                  <Link to="/login" className="btn btn-sm btn-primary">
                    Đăng nhập để đặt câu hỏi
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="faq-chat-log" aria-live="polite">
                {chatMessages.length === 0 ? (
                  <p className="muted" style={{ fontSize: '0.88rem' }}>
                    Hãy nhập câu hỏi của bạn về giữ xe, pin, giá thuê, tiền cọc, trả xe, thanh toán mô phỏng hoặc bảo trì...
                  </p>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`faq-chat-bubble ${msg.sender === 'user' ? 'is-user' : 'is-bot'}`}
                    >
                      <p>{msg.text}</p>
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="faq-sources-row" style={{ marginTop: 6 }}>
                          {msg.sources.map((src, idx) => (
                            <button
                              key={`${msg.id}-src-${idx}`}
                              type="button"
                              className="faq-source-link"
                              onClick={() => setSelectedSource(src)}
                            >
                              Nguồn: {src.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {chatError && (
                <div className="alert alert-danger" role="alert">
                  {chatError}
                </div>
              )}

              <form onSubmit={handleSendChat} className="faq-chat-form">
                <TextField
                  id="faq-chat-input"
                  label="Câu hỏi của bạn"
                  placeholder="Ví dụ: Tôi được giữ xe bao lâu?"
                  maxLength={2000}
                  value={chatInput}
                  disabled={chatLoading}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="primary"
                  loading={chatLoading}
                  disabled={!chatInput.trim()}
                >
                  Gửi câu hỏi
                </Button>
              </form>
            </>
          )}
        </section>
      </div>

      {selectedSource && (
        <FaqSourceModal source={selectedSource} onClose={() => setSelectedSource(null)} />
      )}
    </div>
  );
}
